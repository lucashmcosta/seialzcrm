
BEGIN;

-- 0. Helper de permissão
CREATE OR REPLACE FUNCTION public.user_has_cs_permission(_org uuid, _perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_admin_user() THEN true
    ELSE EXISTS (
      SELECT 1
        FROM public.user_organizations uo
        JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
       WHERE uo.user_id = public.current_user_id()
         AND uo.organization_id = _org
         AND uo.is_active = true
         AND COALESCE((pp.permissions ->> _perm)::boolean, false) = true
    )
  END;
$$;
GRANT EXECUTE ON FUNCTION public.user_has_cs_permission(uuid, text) TO authenticated, service_role;

-- 1. message_threads
ALTER TABLE public.message_threads DROP CONSTRAINT IF EXISTS message_threads_status_check;
ALTER TABLE public.message_threads
  ADD CONSTRAINT message_threads_status_check
  CHECK (status = ANY (ARRAY['open','in_progress','awaiting_client','resolved','closed']));

ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS sla_first_response_target_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolution_target_at timestamptz,
  ADD COLUMN IF NOT EXISTS waiting_started_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid='public.message_threads'::regclass
                    AND conname='message_threads_priority_check') THEN
    ALTER TABLE public.message_threads
      ADD CONSTRAINT message_threads_priority_check
      CHECK (priority = ANY (ARRAY['low','normal','high','urgent']));
  END IF;
END $$;

-- 2. messages.is_internal_note
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_internal_note boolean NOT NULL DEFAULT false;

UPDATE public.messages
   SET is_internal_note = true
 WHERE direction = 'internal' AND is_internal_note = false;

CREATE INDEX IF NOT EXISTS idx_messages_thread_internal
  ON public.messages(thread_id) WHERE is_internal_note = true;

-- 3. communication_endpoints
ALTER TABLE public.communication_endpoints
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid,
  ADD COLUMN IF NOT EXISTS coexistence_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_rating text,
  ADD COLUMN IF NOT EXISTS current_tier integer,
  ADD COLUMN IF NOT EXISTS messaging_limit_per_24h integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='communication_endpoints_purpose_check') THEN
    ALTER TABLE public.communication_endpoints
      ADD CONSTRAINT communication_endpoints_purpose_check
      CHECK (purpose IN ('commercial','customer_service','vendor_personal','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='communication_endpoints_provider_check') THEN
    ALTER TABLE public.communication_endpoints
      ADD CONSTRAINT communication_endpoints_provider_check
      CHECK (provider IS NULL OR provider IN
        ('twilio','meta_cloud_api','meta_cloud_api_coexistence','360dialog','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='communication_endpoints_assigned_user_id_fkey') THEN
    ALTER TABLE public.communication_endpoints
      ADD CONSTRAINT communication_endpoints_assigned_user_id_fkey
      FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.communication_endpoints SET purpose = 'other' WHERE purpose IS NULL;

-- 4. user_organizations.round_robin_queues
ALTER TABLE public.user_organizations
  ADD COLUMN IF NOT EXISTS round_robin_queues text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.user_organizations
   SET round_robin_queues = ARRAY['commercial']
 WHERE round_robin_active = true
   AND (round_robin_queues IS NULL OR cardinality(round_robin_queues) = 0);

CREATE INDEX IF NOT EXISTS idx_user_orgs_rr_queues
  ON public.user_organizations USING GIN (round_robin_queues);

-- 5. tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS thread_id uuid,
  ADD COLUMN IF NOT EXISTS requested_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS resolution_text text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_thread_id_fkey') THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_thread_id_fkey
      FOREIGN KEY (thread_id) REFERENCES public.message_threads(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_requested_by_user_id_fkey') THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_requested_by_user_id_fkey
      FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_thread_pending
  ON public.tasks(thread_id)
  WHERE thread_id IS NOT NULL AND status NOT IN ('completed','canceled');

-- 6.1 team_memberships (polimórfica)
CREATE TABLE IF NOT EXISTS public.team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_type text NOT NULL CHECK (parent_type = ANY (ARRAY['contact','opportunity','thread'])),
  parent_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text,
  is_primary boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  assigned_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_memberships_active
  ON public.team_memberships(organization_id, parent_type, parent_id, user_id)
  WHERE active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tm_primary
  ON public.team_memberships(parent_type, parent_id)
  WHERE active = true AND is_primary = true;

CREATE INDEX IF NOT EXISTS idx_team_memberships_parent
  ON public.team_memberships(parent_type, parent_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_team_memberships_user
  ON public.team_memberships(user_id) WHERE active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_memberships TO authenticated;
GRANT ALL ON public.team_memberships TO service_role;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_memberships_select"
  ON public.team_memberships FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

CREATE POLICY "team_memberships_write"
  ON public.team_memberships FOR ALL TO authenticated
  USING (organization_id = ANY (current_user_org_ids())
         AND (user_has_cs_permission(organization_id, 'manage_assignments')
              OR user_has_cs_permission(organization_id, 'can_manage_cs_queue')))
  WITH CHECK (organization_id = ANY (current_user_org_ids())
              AND (user_has_cs_permission(organization_id, 'manage_assignments')
                   OR user_has_cs_permission(organization_id, 'can_manage_cs_queue')));

-- 6.2 support_categories
CREATE TABLE IF NOT EXISTS public.support_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_categories TO authenticated;
GRANT ALL ON public.support_categories TO service_role;
ALTER TABLE public.support_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_categories_select"
  ON public.support_categories FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

CREATE POLICY "support_categories_write"
  ON public.support_categories FOR ALL TO authenticated
  USING (organization_id = ANY (current_user_org_ids())
         AND user_has_cs_permission(organization_id, 'can_manage_support_settings'))
  WITH CHECK (organization_id = ANY (current_user_org_ids())
              AND user_has_cs_permission(organization_id, 'can_manage_support_settings'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='message_threads_category_id_fkey') THEN
    ALTER TABLE public.message_threads
      ADD CONSTRAINT message_threads_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.support_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6.3 support_sla_configs (unique catch-all)
CREATE TABLE IF NOT EXISTS public.support_sla_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.support_categories(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'normal',
  first_response_minutes integer NOT NULL DEFAULT 60,
  resolution_minutes integer NOT NULL DEFAULT 1440,
  business_hours_only boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (priority = ANY (ARRAY['low','normal','high','urgent']))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sla_configs_org_cat_prio
  ON public.support_sla_configs (organization_id, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid), priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_sla_configs TO authenticated;
GRANT ALL ON public.support_sla_configs TO service_role;
ALTER TABLE public.support_sla_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_sla_configs_select"
  ON public.support_sla_configs FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

CREATE POLICY "support_sla_configs_write"
  ON public.support_sla_configs FOR ALL TO authenticated
  USING (organization_id = ANY (current_user_org_ids())
         AND user_has_cs_permission(organization_id, 'can_manage_support_settings'))
  WITH CHECK (organization_id = ANY (current_user_org_ids())
              AND user_has_cs_permission(organization_id, 'can_manage_support_settings'));

-- 6.4 thread_routing_rules (condition singular)
CREATE TABLE IF NOT EXISTS public.thread_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  action jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_routing_rules TO authenticated;
GRANT ALL ON public.thread_routing_rules TO service_role;
ALTER TABLE public.thread_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_routing_rules_select"
  ON public.thread_routing_rules FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

CREATE POLICY "thread_routing_rules_write"
  ON public.thread_routing_rules FOR ALL TO authenticated
  USING (organization_id = ANY (current_user_org_ids())
         AND user_has_cs_permission(organization_id, 'can_manage_support_settings'))
  WITH CHECK (organization_id = ANY (current_user_org_ids())
              AND user_has_cs_permission(organization_id, 'can_manage_support_settings'));

CREATE INDEX IF NOT EXISTS idx_routing_rules_org_active
  ON public.thread_routing_rules(organization_id, priority) WHERE is_active;

-- 6.5 thread_assignment_history (append-only)
CREATE TABLE IF NOT EXISTS public.thread_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type = ANY (ARRAY[
    'initial_assignment','manual_assignment','round_robin','rule_match',
    'take_over','escalation','reopen','auto_reassign'
  ])),
  from_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  performed_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.thread_assignment_history TO authenticated;
GRANT ALL ON public.thread_assignment_history TO service_role;
ALTER TABLE public.thread_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_assignment_history_select"
  ON public.thread_assignment_history FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

CREATE INDEX IF NOT EXISTS idx_assignment_hist_thread
  ON public.thread_assignment_history(thread_id, created_at DESC);

-- 6.6 escalation_targets
CREATE TABLE IF NOT EXISTS public.escalation_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  category_id uuid REFERENCES public.support_categories(id) ON DELETE SET NULL,
  priority text,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  escalate_after_minutes integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (priority IS NULL OR priority = ANY (ARRAY['low','normal','high','urgent']))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.escalation_targets TO authenticated;
GRANT ALL ON public.escalation_targets TO service_role;
ALTER TABLE public.escalation_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "escalation_targets_select"
  ON public.escalation_targets FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

CREATE POLICY "escalation_targets_write"
  ON public.escalation_targets FOR ALL TO authenticated
  USING (organization_id = ANY (current_user_org_ids())
         AND user_has_cs_permission(organization_id, 'can_manage_support_settings'))
  WITH CHECK (organization_id = ANY (current_user_org_ids())
              AND user_has_cs_permission(organization_id, 'can_manage_support_settings'));

CREATE INDEX IF NOT EXISTS idx_escalation_targets_org
  ON public.escalation_targets(organization_id) WHERE is_active;

-- 7. message_threads SELECT policy (extensão mínima)
DROP POLICY IF EXISTS "Users can view threads in their org" ON public.message_threads;

CREATE POLICY "Users can view threads in their org"
  ON public.message_threads FOR SELECT TO authenticated
  USING (
    is_admin_user()
    OR (
      organization_id = ANY (current_user_org_ids())
      AND (
        user_can_view_all(organization_id, 'threads')
        OR assigned_user_id = current_user_id()
        OR (assigned_user_id IS NULL
            AND user_has_cs_permission(organization_id, 'can_manage_cs_queue'))
      )
    )
  );

-- 8. Permissões conservadoras (preserva existente; default true só para Admin)
WITH defaults AS (
  SELECT id,
    jsonb_build_object(
      'can_manage_cs_queue',         (name = 'Admin'),
      'can_takeover_thread',         (name = 'Admin'),
      'can_escalate_thread',         (name = 'Admin'),
      'can_close_threads',           (name = 'Admin'),
      'can_manage_support_settings', (name = 'Admin'),
      'can_send_templates',          (name = 'Admin')
    ) AS def
  FROM public.permission_profiles
)
UPDATE public.permission_profiles pp
   SET permissions = d.def || COALESCE(pp.permissions, '{}'::jsonb),
       updated_at  = now()
  FROM defaults d
 WHERE d.id = pp.id;

-- 9. Seeds
INSERT INTO public.support_categories (organization_id, key, label, color)
SELECT o.id, k.key, k.label, k.color
  FROM public.organizations o
  CROSS JOIN (VALUES
    ('duvida_geral',      'Dúvida Geral',       '#64748b'),
    ('documentacao',      'Documentação',       '#0ea5e9'),
    ('financeiro',        'Financeiro',         '#f59e0b'),
    ('reclamacao',        'Reclamação',         '#ef4444'),
    ('andamento_processo','Andamento Processo', '#8b5cf6'),
    ('outros',            'Outros',             '#94a3b8')
  ) AS k(key, label, color)
ON CONFLICT (organization_id, key) DO NOTHING;

INSERT INTO public.support_sla_configs (organization_id, category_id, priority, first_response_minutes, resolution_minutes)
SELECT o.id, NULL, 'normal', 60, 1440
  FROM public.organizations o
 WHERE NOT EXISTS (
   SELECT 1 FROM public.support_sla_configs s
    WHERE s.organization_id = o.id AND s.category_id IS NULL AND s.priority = 'normal'
 );

INSERT INTO public.escalation_targets (organization_id, name, escalate_after_minutes)
SELECT o.id, 'Escalonamento padrão', 30
  FROM public.organizations o
 WHERE NOT EXISTS (
   SELECT 1 FROM public.escalation_targets e
    WHERE e.organization_id = o.id AND e.name = 'Escalonamento padrão'
 );

-- 10. Triggers updated_at
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'team_memberships','support_categories','support_sla_configs',
    'thread_routing_rules','escalation_targets'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = format('set_updated_at_%s', t)) THEN
      EXECUTE format(
        'CREATE TRIGGER set_updated_at_%1$s BEFORE UPDATE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t);
    END IF;
  END LOOP;
END $$;

-- 11. Índices de performance
CREATE INDEX IF NOT EXISTS idx_threads_org_status_priority
  ON public.message_threads(organization_id, status, priority, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_threads_sla_first_response
  ON public.message_threads(sla_first_response_target_at)
  WHERE first_response_at IS NULL AND sla_first_response_target_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_threads_sla_resolution
  ON public.message_threads(sla_resolution_target_at)
  WHERE status NOT IN ('resolved','closed') AND sla_resolution_target_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_threads_unassigned_queue
  ON public.message_threads(organization_id, last_message_at DESC)
  WHERE assigned_user_id IS NULL AND status NOT IN ('resolved','closed');

COMMIT;
