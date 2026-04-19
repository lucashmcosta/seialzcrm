-- ============================================================
-- PART A: Schema changes
-- ============================================================

-- organizations: feature flags
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS round_robin_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS round_robin_scope text NOT NULL DEFAULT 'threads_and_contacts',
  ADD COLUMN IF NOT EXISTS private_records_enabled boolean NOT NULL DEFAULT false;

-- user_organizations: round-robin participation
ALTER TABLE public.user_organizations
  ADD COLUMN IF NOT EXISTS round_robin_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz;

-- message_threads: original owner for smart reopening
ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS original_owner_user_id uuid REFERENCES public.users(id);

-- Partial index for atomic round-robin selection
CREATE INDEX IF NOT EXISTS idx_user_orgs_rr_queue
  ON public.user_organizations (organization_id, last_assigned_at NULLS FIRST)
  WHERE round_robin_active = true AND is_active = true;

-- ============================================================
-- PART B: Defensive backfill — protect existing admins
-- ============================================================
UPDATE public.permission_profiles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'view_all_contacts', true,
  'view_all_opportunities', true,
  'view_all_threads', true,
  'manage_assignments', true,
  'round_robin_recipient', false
)
WHERE name = 'Admin';

-- ============================================================
-- PART C: Functions and triggers
-- ============================================================

-- 1) user_can_view_all(org_id, entity) — STABLE SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.user_can_view_all(_org_id uuid, _entity text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_private_enabled boolean;
  v_user_id uuid;
  v_perm_key text;
  v_has_perm boolean;
BEGIN
  SELECT private_records_enabled INTO v_private_enabled
  FROM organizations WHERE id = _org_id;

  -- If org doesn't have privacy enabled, everyone sees all
  IF v_private_enabled IS NOT TRUE THEN
    RETURN true;
  END IF;

  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_perm_key := 'view_all_' || _entity;

  SELECT COALESCE((pp.permissions ->> v_perm_key)::boolean, false)
  INTO v_has_perm
  FROM user_organizations uo
  JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
  WHERE uo.user_id = v_user_id
    AND uo.organization_id = _org_id
    AND uo.is_active = true
  LIMIT 1;

  RETURN COALESCE(v_has_perm, false);
END;
$$;

-- 2) assign_round_robin(org_id) — atomic with SKIP LOCKED
CREATE OR REPLACE FUNCTION public.assign_round_robin(_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_user_id uuid;
  v_uo_id uuid;
BEGIN
  SELECT round_robin_enabled INTO v_enabled
  FROM organizations WHERE id = _org_id;

  IF v_enabled IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- Atomic pick: oldest last_assigned_at among eligible recipients
  SELECT uo.id, uo.user_id
  INTO v_uo_id, v_user_id
  FROM user_organizations uo
  JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
  WHERE uo.organization_id = _org_id
    AND uo.is_active = true
    AND uo.round_robin_active = true
    AND COALESCE((pp.permissions ->> 'round_robin_recipient')::boolean, false) = true
  ORDER BY uo.last_assigned_at NULLS FIRST, uo.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE user_organizations
  SET last_assigned_at = now()
  WHERE id = v_uo_id;

  RETURN v_user_id;
END;
$$;

-- 3) Trigger: contacts BEFORE INSERT — auto-assign owner
CREATE OR REPLACE FUNCTION public.trg_contacts_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned uuid;
  v_scope text;
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT round_robin_scope INTO v_scope
  FROM organizations WHERE id = NEW.organization_id;

  IF v_scope NOT IN ('contacts_only', 'threads_and_contacts') THEN
    RETURN NEW;
  END IF;

  v_assigned := assign_round_robin(NEW.organization_id);
  IF v_assigned IS NOT NULL THEN
    NEW.owner_user_id := v_assigned;

    -- Audit
    INSERT INTO activities (organization_id, contact_id, activity_type, title, body, occurred_at)
    VALUES (
      NEW.organization_id,
      NEW.id,
      'note',
      'Atribuição automática',
      'Contato auto-atribuído via round-robin',
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_round_robin ON public.contacts;
CREATE TRIGGER contacts_round_robin
  BEFORE INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.trg_contacts_round_robin();

-- 4) Trigger: message_threads BEFORE INSERT — inherit from contact, fallback RR
CREATE OR REPLACE FUNCTION public.trg_threads_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned uuid;
  v_scope text;
  v_contact_owner uuid;
BEGIN
  -- If thread already has assigned user, preserve and snapshot original owner
  IF NEW.assigned_user_id IS NOT NULL THEN
    IF NEW.original_owner_user_id IS NULL THEN
      NEW.original_owner_user_id := NEW.assigned_user_id;
    END IF;
    RETURN NEW;
  END IF;

  SELECT round_robin_scope INTO v_scope
  FROM organizations WHERE id = NEW.organization_id;

  IF v_scope NOT IN ('threads_only', 'threads_and_contacts') THEN
    RETURN NEW;
  END IF;

  -- Try to inherit from contact
  IF NEW.contact_id IS NOT NULL THEN
    SELECT owner_user_id INTO v_contact_owner
    FROM contacts WHERE id = NEW.contact_id;

    IF v_contact_owner IS NOT NULL THEN
      NEW.assigned_user_id := v_contact_owner;
      NEW.original_owner_user_id := v_contact_owner;
      RETURN NEW;
    END IF;
  END IF;

  -- Fallback: roll the dice
  v_assigned := assign_round_robin(NEW.organization_id);
  IF v_assigned IS NOT NULL THEN
    NEW.assigned_user_id := v_assigned;
    NEW.original_owner_user_id := v_assigned;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS threads_round_robin ON public.message_threads;
CREATE TRIGGER threads_round_robin
  BEFORE INSERT ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.trg_threads_round_robin();

-- 5) Trigger: opportunities BEFORE INSERT — inherit from contact, fallback RR
CREATE OR REPLACE FUNCTION public.trg_opportunities_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned uuid;
  v_contact_owner uuid;
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.contact_id IS NOT NULL THEN
    SELECT owner_user_id INTO v_contact_owner
    FROM contacts WHERE id = NEW.contact_id;

    IF v_contact_owner IS NOT NULL THEN
      NEW.owner_user_id := v_contact_owner;
      RETURN NEW;
    END IF;
  END IF;

  v_assigned := assign_round_robin(NEW.organization_id);
  IF v_assigned IS NOT NULL THEN
    NEW.owner_user_id := v_assigned;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_round_robin ON public.opportunities;
CREATE TRIGGER opportunities_round_robin
  BEFORE INSERT ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.trg_opportunities_round_robin();

-- 6) Trigger: messages AFTER INSERT — smart reopening
CREATE OR REPLACE FUNCTION public.trg_messages_smart_reopen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread record;
  v_owner_active boolean;
  v_new_owner uuid;
BEGIN
  -- Only handle inbound messages
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;

  SELECT id, organization_id, status, assigned_user_id, original_owner_user_id
  INTO v_thread
  FROM message_threads
  WHERE id = NEW.thread_id;

  IF v_thread.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only reopen if currently closed/resolved
  IF v_thread.status NOT IN ('closed', 'resolved') THEN
    RETURN NEW;
  END IF;

  -- Check if original owner is still active in this org
  v_owner_active := false;
  IF v_thread.original_owner_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_id = v_thread.original_owner_user_id
        AND organization_id = v_thread.organization_id
        AND is_active = true
    ) INTO v_owner_active;
  END IF;

  IF v_owner_active THEN
    v_new_owner := v_thread.original_owner_user_id;
  ELSE
    -- TODO(next-sprint): trocar por "caixa não atribuída" + task pro gestor
    v_new_owner := assign_round_robin(v_thread.organization_id);
    IF v_new_owner IS NULL THEN
      v_new_owner := v_thread.assigned_user_id;
    END IF;
  END IF;

  UPDATE message_threads
  SET status = 'open',
      assigned_user_id = v_new_owner,
      resolved_at = NULL
  WHERE id = v_thread.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_smart_reopen ON public.messages;
CREATE TRIGGER messages_smart_reopen
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_messages_smart_reopen();

-- ============================================================
-- PART D: Refactor RLS for contacts, opportunities, message_threads
-- ============================================================

-- CONTACTS — drop the two duplicate SELECT policies, install unified one
DROP POLICY IF EXISTS "Users can view contacts in their org" ON public.contacts;
DROP POLICY IF EXISTS "Admins can view all contacts" ON public.contacts;

CREATE POLICY "Users can view contacts in their org"
ON public.contacts
FOR SELECT
USING (
  is_admin_user()
  OR (
    organization_id = ANY(current_user_org_ids())
    AND deleted_at IS NULL
    AND (
      public.user_can_view_all(organization_id, 'contacts')
      OR owner_user_id = current_user_id()
    )
  )
);

-- OPPORTUNITIES — find existing select policy and replace with unified
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'opportunities' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.opportunities', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view opportunities in their org"
ON public.opportunities
FOR SELECT
USING (
  is_admin_user()
  OR (
    organization_id = ANY(current_user_org_ids())
    AND deleted_at IS NULL
    AND (
      public.user_can_view_all(organization_id, 'opportunities')
      OR owner_user_id = current_user_id()
    )
  )
);

-- MESSAGE_THREADS — replace SELECT policies with unified
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'message_threads' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.message_threads', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view threads in their org"
ON public.message_threads
FOR SELECT
USING (
  is_admin_user()
  OR (
    organization_id = ANY(current_user_org_ids())
    AND (
      public.user_can_view_all(organization_id, 'threads')
      OR assigned_user_id = current_user_id()
    )
  )
);