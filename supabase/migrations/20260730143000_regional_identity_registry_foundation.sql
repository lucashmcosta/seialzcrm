-- Seialz regional identity + Brazilian registry providers foundation.
-- Additive and tenant-safe. Existing names/addresses are never rewritten here.

DO $$ BEGIN
  CREATE TYPE public.cpf_verification_status AS ENUM (
    'unverified',
    'pending',
    'verified',
    'invalid',
    'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS operating_country_code text;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_operating_country_code_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_operating_country_code_check
  CHECK (operating_country_code IS NULL OR operating_country_code IN ('BR', 'US'));

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS address_country_code text;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_address_country_code_check;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_address_country_code_check
  CHECK (address_country_code IS NULL OR address_country_code ~ '^[A-Z]{2}$');

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS registration_status text,
  ADD COLUMN IF NOT EXISTS opened_at date,
  ADD COLUMN IF NOT EXISTS legal_nature text,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS primary_cnae_code text,
  ADD COLUMN IF NOT EXISTS primary_cnae_description text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS address_neighborhood text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS address_zip text,
  ADD COLUMN IF NOT EXISTS address_country_code text;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_address_country_code_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_address_country_code_check
  CHECK (address_country_code IS NULL OR address_country_code ~ '^[A-Z]{2}$');

DROP INDEX IF EXISTS public.uq_companies_org_cnpj;
CREATE UNIQUE INDEX uq_companies_org_cnpj
  ON public.companies (
    organization_id,
    upper(regexp_replace(cnpj, '[^0-9A-Za-z]', '', 'g'))
  )
  WHERE cnpj IS NOT NULL AND btrim(cnpj) <> '' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.contact_identity_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL UNIQUE REFERENCES public.contacts(id) ON DELETE CASCADE,
  cpf_verification_status public.cpf_verification_status NOT NULL DEFAULT 'unverified',
  cpf_registration_status text,
  birth_date date,
  sex text,
  mother_name text,
  verification_provider text,
  verification_provider_version text,
  cpf_verified_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_identity_profiles_org_status
  ON public.contact_identity_profiles (organization_id, cpf_verification_status);

CREATE TABLE IF NOT EXISTS public.registry_lookup_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  lookup_kind text NOT NULL CHECK (lookup_kind IN ('cep', 'cnpj', 'cpf')),
  provider text NOT NULL,
  identifier_hash text NOT NULL,
  identifier_suffix text,
  outcome text NOT NULL,
  http_status integer,
  duration_ms integer,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registry_lookup_audit_org_created
  ON public.registry_lookup_audit (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.registry_lookup_cache (
  lookup_kind text NOT NULL CHECK (lookup_kind IN ('cep', 'cnpj')),
  identifier_hash text NOT NULL,
  provider text NOT NULL,
  normalized_payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lookup_kind, identifier_hash, provider)
);

CREATE TABLE IF NOT EXISTS public.registry_data_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  conflict_type text NOT NULL,
  current_value text,
  provider_value text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  resolved_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registry_data_conflicts_pending
  ON public.registry_data_conflicts (organization_id, created_at DESC)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.registry_backfill_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'cpf' CHECK (kind = 'cpf'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'error')),
  total_items integer NOT NULL DEFAULT 0,
  processed_items integer NOT NULL DEFAULT 0,
  verified_items integer NOT NULL DEFAULT 0,
  conflict_items integer NOT NULL DEFAULT 0,
  error_items integer NOT NULL DEFAULT 0,
  last_contact_id uuid,
  last_error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_registry_backfill_active_job
  ON public.registry_backfill_jobs (organization_id, kind)
  WHERE status IN ('pending', 'running', 'paused');

CREATE TABLE IF NOT EXISTS public.registry_provider_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  cpf_lookup_enabled boolean NOT NULL DEFAULT false,
  documented_purpose text,
  privacy_notice_updated_at timestamptz,
  enabled_at timestamptz,
  enabled_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    cpf_lookup_enabled = false
    OR (
      length(btrim(COALESCE(documented_purpose, ''))) >= 20
      AND privacy_notice_updated_at IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS public.contact_name_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (contact_id, reason)
);

CREATE TABLE IF NOT EXISTS public.contact_ingress_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source text NOT NULL,
  external_id text,
  reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'discarded')),
  attempt_count integer NOT NULL DEFAULT 1,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_ingress_failure_open
  ON public.contact_ingress_failures (
    organization_id,
    source,
    COALESCE(external_id, ''),
    reason
  )
  WHERE status = 'pending';

ALTER TABLE public.contact_identity_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_lookup_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_lookup_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_data_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_backfill_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_name_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_ingress_failures ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_has_org_permission(_org_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin_user() OR EXISTS (
    SELECT 1
    FROM public.user_organizations uo
    JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = public.current_user_id()
      AND uo.organization_id = _org_id
      AND uo.is_active = true
      AND COALESCE((pp.permissions ->> _permission)::boolean, false)
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_org_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_org_permission(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "identity_profiles_select" ON public.contact_identity_profiles;
CREATE POLICY "identity_profiles_select"
  ON public.contact_identity_profiles FOR SELECT TO authenticated
  USING (
    public.user_has_org_access(organization_id)
    AND (
      public.user_has_org_permission(organization_id, 'can_view_contacts')
      OR public.user_has_org_permission(organization_id, 'can_edit_contacts')
    )
  );

DROP POLICY IF EXISTS "identity_profiles_write" ON public.contact_identity_profiles;
CREATE POLICY "identity_profiles_write"
  ON public.contact_identity_profiles FOR ALL TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_edit_contacts'))
  WITH CHECK (
    public.user_has_org_permission(organization_id, 'can_edit_contacts')
    AND EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_id AND c.organization_id = organization_id
    )
  );

DROP POLICY IF EXISTS "registry_lookup_audit_org_read" ON public.registry_lookup_audit;
CREATE POLICY "registry_lookup_audit_org_read"
  ON public.registry_lookup_audit FOR SELECT TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'));

DROP POLICY IF EXISTS "registry_conflicts_org_access" ON public.registry_data_conflicts;
CREATE POLICY "registry_conflicts_org_access"
  ON public.registry_data_conflicts FOR ALL TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_edit_contacts'))
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_edit_contacts'));

DROP POLICY IF EXISTS "registry_backfill_org_read" ON public.registry_backfill_jobs;
CREATE POLICY "registry_backfill_org_read"
  ON public.registry_backfill_jobs FOR SELECT TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'));

DROP POLICY IF EXISTS "registry_provider_settings_org_access" ON public.registry_provider_settings;
CREATE POLICY "registry_provider_settings_org_access"
  ON public.registry_provider_settings FOR ALL TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'))
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_manage_settings'));

DROP POLICY IF EXISTS "contact_name_review_org_access" ON public.contact_name_review_queue;
CREATE POLICY "contact_name_review_org_access"
  ON public.contact_name_review_queue FOR ALL TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_edit_contacts'))
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_edit_contacts'));

DROP POLICY IF EXISTS "contact_ingress_failures_org_access" ON public.contact_ingress_failures;
CREATE POLICY "contact_ingress_failures_org_access"
  ON public.contact_ingress_failures FOR ALL TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'))
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_manage_settings'));

-- Cache is server-only. service_role bypasses RLS.
REVOKE ALL ON public.registry_lookup_cache FROM anon, authenticated;
REVOKE ALL ON public.registry_lookup_audit FROM anon;
REVOKE ALL ON public.registry_backfill_jobs FROM anon;

CREATE OR REPLACE FUNCTION public.normalize_identity_digits(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(_value, ''), '[^0-9A-Za-z]', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.is_valid_cpf(_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_cpf text := regexp_replace(COALESCE(_value, ''), '[^0-9]', '', 'g');
  v_sum integer := 0;
  v_digit_1 integer;
  v_digit_2 integer;
  v_index integer;
BEGIN
  IF v_cpf !~ '^[0-9]{11}$' OR v_cpf ~ '^([0-9])\1{10}$' THEN
    RETURN false;
  END IF;

  FOR v_index IN 1..9 LOOP
    v_sum := v_sum + substr(v_cpf, v_index, 1)::integer * (11 - v_index);
  END LOOP;
  v_digit_1 := 11 - (v_sum % 11);
  IF v_digit_1 >= 10 THEN v_digit_1 := 0; END IF;

  v_sum := 0;
  FOR v_index IN 1..10 LOOP
    v_sum := v_sum + substr(v_cpf, v_index, 1)::integer * (12 - v_index);
  END LOOP;
  v_digit_2 := 11 - (v_sum % 11);
  IF v_digit_2 >= 10 THEN v_digit_2 := 0; END IF;

  RETURN v_digit_1 = substr(v_cpf, 10, 1)::integer
     AND v_digit_2 = substr(v_cpf, 11, 1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_cnpj(_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_cnpj text := upper(regexp_replace(COALESCE(_value, ''), '[^0-9A-Za-z]', '', 'g'));
  v_weights_1 integer[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  v_weights_2 integer[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  v_sum integer := 0;
  v_digit_1 integer;
  v_digit_2 integer;
  v_index integer;
  v_value integer;
BEGIN
  IF v_cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' OR v_cnpj ~ '^([0-9])\1{13}$' THEN
    RETURN false;
  END IF;

  FOR v_index IN 1..12 LOOP
    v_value := ascii(substr(v_cnpj, v_index, 1)) - 48;
    v_sum := v_sum + v_value * v_weights_1[v_index];
  END LOOP;
  v_digit_1 := CASE WHEN (v_sum % 11) < 2 THEN 0 ELSE 11 - (v_sum % 11) END;

  v_sum := 0;
  FOR v_index IN 1..12 LOOP
    v_value := ascii(substr(v_cnpj, v_index, 1)) - 48;
    v_sum := v_sum + v_value * v_weights_2[v_index];
  END LOOP;
  v_sum := v_sum + v_digit_1 * v_weights_2[13];
  v_digit_2 := CASE WHEN (v_sum % 11) < 2 THEN 0 ELSE 11 - (v_sum % 11) END;

  RETURN v_digit_1 = substr(v_cnpj, 13, 1)::integer
     AND v_digit_2 = substr(v_cnpj, 14, 1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_enforce_contact_regional_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_country text;
  v_duplicate uuid;
BEGIN
  SELECT operating_country_code INTO v_country
  FROM public.organizations
  WHERE id = NEW.organization_id;

  -- Rollout compatibility: tenants not migrated yet keep their legacy write
  -- path. The frontend requires a choice before manual edits, while ingress
  -- remains available until that tenant is explicitly migrated.
  IF v_country IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.full_name := regexp_replace(btrim(COALESCE(NEW.full_name, '')), '\s+', ' ', 'g');
  NEW.first_name := NULLIF(regexp_replace(btrim(COALESCE(NEW.first_name, '')), '\s+', ' ', 'g'), '');
  NEW.last_name := NULLIF(regexp_replace(btrim(COALESCE(NEW.last_name, '')), '\s+', ' ', 'g'), '');

  IF v_country = 'US' THEN
    IF NEW.first_name IS NULL OR NEW.last_name IS NULL THEN
      RAISE EXCEPTION 'name_parts_required'
        USING ERRCODE = '23514';
    END IF;
    NEW.full_name := NEW.first_name || ' ' || NEW.last_name;
  ELSIF NEW.full_name = '' THEN
    RAISE EXCEPTION 'full_name_required'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.address_country_code IS NULL THEN
    NEW.address_country_code := v_country;
  END IF;

  IF NEW.cpf IS NOT NULL AND btrim(NEW.cpf) <> '' THEN
    NEW.cpf := public.normalize_identity_digits(NEW.cpf);
    IF NEW.cpf !~ '^[0-9]{11}$' THEN
      RAISE EXCEPTION 'invalid_cpf_format'
        USING ERRCODE = '23514';
    END IF;
    IF NOT public.is_valid_cpf(NEW.cpf) THEN
      RAISE EXCEPTION 'invalid_cpf'
        USING ERRCODE = '23514';
    END IF;
    IF v_country <> 'BR' AND (TG_OP = 'INSERT' OR NEW.cpf IS DISTINCT FROM OLD.cpf) THEN
      RAISE EXCEPTION 'cpf_only_available_for_br'
        USING ERRCODE = '23514';
    END IF;

    -- Serializes equal CPF writes inside the tenant, closing the race between
    -- the duplicate check and the row write without rewriting legacy duplicates.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW.organization_id::text || ':' || NEW.cpf, 0)
    );
    SELECT c.id INTO v_duplicate
    FROM public.contacts c
    WHERE c.organization_id = NEW.organization_id
      AND c.id <> NEW.id
      AND c.deleted_at IS NULL
      AND public.normalize_identity_digits(c.cpf) = NEW.cpf
    LIMIT 1;
    IF v_duplicate IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate_cpf:%', v_duplicate
        USING ERRCODE = '23505';
    END IF;
  ELSE
    NEW.cpf := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_regional_identity ON public.contacts;
CREATE TRIGGER trg_contacts_regional_identity
BEFORE INSERT OR UPDATE OF organization_id, full_name, first_name, last_name, cpf,
  address_country_code
ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_contact_regional_identity();

CREATE OR REPLACE FUNCTION public.fn_enforce_company_regional_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_country text;
BEGIN
  SELECT operating_country_code INTO v_country
  FROM public.organizations
  WHERE id = NEW.organization_id;

  -- Same staged rollout rule used by contacts.
  IF v_country IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.address_country_code IS NULL THEN
    NEW.address_country_code := v_country;
  END IF;

  IF NEW.cnpj IS NOT NULL AND btrim(NEW.cnpj) <> '' THEN
    NEW.cnpj := upper(public.normalize_identity_digits(NEW.cnpj));
    IF v_country <> 'BR' AND (TG_OP = 'INSERT' OR NEW.cnpj IS DISTINCT FROM OLD.cnpj) THEN
      RAISE EXCEPTION 'cnpj_only_available_for_br'
        USING ERRCODE = '23514';
    END IF;
    IF NOT public.is_valid_cnpj(NEW.cnpj) THEN
      RAISE EXCEPTION 'invalid_cnpj'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    NEW.cnpj := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_regional_identity ON public.companies;
CREATE TRIGGER trg_companies_regional_identity
BEFORE INSERT OR UPDATE OF organization_id, cnpj, address_country_code
ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_company_regional_identity();

CREATE OR REPLACE FUNCTION public.fn_reset_cpf_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.cpf IS DISTINCT FROM OLD.cpf THEN
    INSERT INTO public.contact_identity_profiles (
      organization_id, contact_id, cpf_verification_status, updated_at
    ) VALUES (
      NEW.organization_id, NEW.id, 'unverified', now()
    )
    ON CONFLICT (contact_id) DO UPDATE SET
      cpf_verification_status = 'unverified',
      cpf_registration_status = NULL,
      birth_date = NULL,
      sex = NULL,
      mother_name = NULL,
      verification_provider = NULL,
      verification_provider_version = NULL,
      cpf_verified_at = NULL,
      last_error_code = NULL,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_reset_cpf_verification ON public.contacts;
CREATE TRIGGER trg_contacts_reset_cpf_verification
AFTER UPDATE OF cpf ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.fn_reset_cpf_verification();

CREATE OR REPLACE FUNCTION public.fn_guard_operating_country_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.operating_country_code IS DISTINCT FROM OLD.operating_country_code
     AND auth.role() <> 'service_role'
     AND NOT public.user_has_org_permission(OLD.id, 'can_manage_settings') THEN
    RAISE EXCEPTION 'forbidden_manage_settings' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_operating_country_change ON public.organizations;
CREATE TRIGGER trg_guard_operating_country_change
BEFORE UPDATE OF operating_country_code ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_operating_country_change();

CREATE OR REPLACE FUNCTION public.rpc_set_operating_country(
  p_organization_id uuid,
  p_country_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_country text := upper(btrim(COALESCE(p_country_code, '')));
  v_previous text;
  v_job_id uuid;
  v_total integer := 0;
BEGIN
  IF v_country NOT IN ('BR', 'US') THEN
    RAISE EXCEPTION 'unsupported_operating_country' USING ERRCODE = '22023';
  END IF;
  IF NOT public.user_has_org_permission(p_organization_id, 'can_manage_settings') THEN
    RAISE EXCEPTION 'forbidden_manage_settings' USING ERRCODE = '42501';
  END IF;

  SELECT operating_country_code INTO v_previous
  FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.organizations
  SET operating_country_code = v_country, updated_at = now()
  WHERE id = p_organization_id;

  IF v_country <> 'BR' THEN
    UPDATE public.registry_provider_settings
    SET cpf_lookup_enabled = false,
        enabled_at = NULL,
        enabled_by_user_id = NULL,
        updated_at = now()
    WHERE organization_id = p_organization_id;
  END IF;

  IF v_country = 'US' THEN
    -- Existing US contacts are only recomposed when both parts were already
    -- explicitly stored. No Brazilian-style name splitting is attempted.
    UPDATE public.contacts c
    SET full_name = regexp_replace(
          btrim(c.first_name) || ' ' || btrim(c.last_name),
          '\s+',
          ' ',
          'g'
        ),
        address_country_code = COALESCE(c.address_country_code, 'US'),
        updated_at = now()
    WHERE c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
      AND NULLIF(btrim(c.first_name), '') IS NOT NULL
      AND NULLIF(btrim(c.last_name), '') IS NOT NULL;

    INSERT INTO public.contact_name_review_queue (organization_id, contact_id, reason)
    SELECT c.organization_id, c.id, 'us_name_parts_missing'
    FROM public.contacts c
    WHERE c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
      AND (NULLIF(btrim(c.first_name), '') IS NULL OR NULLIF(btrim(c.last_name), '') IS NULL)
    ON CONFLICT (contact_id, reason) DO NOTHING;
  ELSE
    SELECT count(*) INTO v_total
    FROM public.contacts c
    WHERE c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
      AND public.normalize_identity_digits(c.cpf) ~ '^[0-9]{11}$';

    IF v_total > 0 THEN
      INSERT INTO public.registry_backfill_jobs (
        organization_id, kind, status, total_items
      ) VALUES (
        p_organization_id, 'cpf', 'pending', v_total
      )
      ON CONFLICT (organization_id, kind)
        WHERE status IN ('pending', 'running', 'paused')
      DO UPDATE SET
        total_items = EXCLUDED.total_items,
        updated_at = now()
      RETURNING id INTO v_job_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, entity_type, entity_id, action, old_data, new_data,
    changed_by_user_id
  ) VALUES (
    p_organization_id, 'organizations', p_organization_id,
    'OPERATING_COUNTRY_CHANGED',
    jsonb_build_object('operating_country_code', v_previous),
    jsonb_build_object('operating_country_code', v_country, 'backfill_job_id', v_job_id),
    public.current_user_id()
  );

  RETURN jsonb_build_object(
    'operating_country_code', v_country,
    'backfill_job_id', v_job_id,
    'backfill_total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_set_operating_country(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_operating_country(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_configure_cpf_registry(
  p_organization_id uuid,
  p_enabled boolean,
  p_documented_purpose text DEFAULT NULL,
  p_privacy_notice_confirmed boolean DEFAULT false
)
RETURNS public.registry_provider_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_country text;
  v_result public.registry_provider_settings;
BEGIN
  IF NOT public.user_has_org_permission(p_organization_id, 'can_manage_settings') THEN
    RAISE EXCEPTION 'forbidden_manage_settings' USING ERRCODE = '42501';
  END IF;

  SELECT operating_country_code INTO v_country
  FROM public.organizations
  WHERE id = p_organization_id;
  IF v_country IS DISTINCT FROM 'BR' THEN
    RAISE EXCEPTION 'cpf_registry_requires_br' USING ERRCODE = '23514';
  END IF;
  IF p_enabled AND (
    length(btrim(COALESCE(p_documented_purpose, ''))) < 20
    OR NOT p_privacy_notice_confirmed
  ) THEN
    RAISE EXCEPTION 'cpf_registry_compliance_required' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.registry_provider_settings (
    organization_id,
    cpf_lookup_enabled,
    documented_purpose,
    privacy_notice_updated_at,
    enabled_at,
    enabled_by_user_id,
    updated_at
  ) VALUES (
    p_organization_id,
    p_enabled,
    NULLIF(btrim(COALESCE(p_documented_purpose, '')), ''),
    CASE WHEN p_privacy_notice_confirmed THEN now() ELSE NULL END,
    CASE WHEN p_enabled THEN now() ELSE NULL END,
    CASE WHEN p_enabled THEN public.current_user_id() ELSE NULL END,
    now()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    cpf_lookup_enabled = EXCLUDED.cpf_lookup_enabled,
    documented_purpose = EXCLUDED.documented_purpose,
    privacy_notice_updated_at = EXCLUDED.privacy_notice_updated_at,
    enabled_at = EXCLUDED.enabled_at,
    enabled_by_user_id = EXCLUDED.enabled_by_user_id,
    updated_at = now()
  RETURNING * INTO v_result;

  INSERT INTO public.audit_logs (
    organization_id, entity_type, entity_id, action, new_data,
    changed_by_user_id
  ) VALUES (
    p_organization_id,
    'registry_provider_settings',
    p_organization_id,
    CASE WHEN p_enabled THEN 'CPF_REGISTRY_ENABLED' ELSE 'CPF_REGISTRY_DISABLED' END,
    jsonb_build_object(
      'cpf_lookup_enabled', p_enabled,
      'purpose_documented', length(btrim(COALESCE(p_documented_purpose, ''))) >= 20,
      'privacy_notice_confirmed', p_privacy_notice_confirmed
    ),
    public.current_user_id()
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_configure_cpf_registry(uuid, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_configure_cpf_registry(uuid, boolean, text, boolean) TO authenticated;

-- Inventory existing CPF duplicates without rewriting or merging contacts.
INSERT INTO public.registry_data_conflicts (
  organization_id, contact_id, conflict_type, current_value, provider_value
)
SELECT
  c.organization_id,
  c.id,
  'duplicate_cpf_existing',
  right(public.normalize_identity_digits(c.cpf), 4),
  first_value(c.id::text) OVER (
    PARTITION BY c.organization_id, public.normalize_identity_digits(c.cpf)
    ORDER BY c.created_at, c.id
  )
FROM public.contacts c
WHERE c.deleted_at IS NULL
  AND public.normalize_identity_digits(c.cpf) ~ '^[0-9]{11}$'
  AND EXISTS (
    SELECT 1
    FROM public.contacts other
    WHERE other.organization_id = c.organization_id
      AND other.id <> c.id
      AND other.deleted_at IS NULL
      AND public.normalize_identity_digits(other.cpf) = public.normalize_identity_digits(c.cpf)
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.integration_feature_flags (
  flag_key, organization_id, enabled, metadata
) VALUES (
  'registry_lookup_br',
  NULL,
  false,
  jsonb_build_object(
    'description',
    'Habilita consultas brasileiras de CEP, CNPJ e CPF pelo backend agnóstico.'
  )
)
ON CONFLICT DO NOTHING;

-- Controlled BR rollout: only the two explicitly approved pilot tenants.
-- Existing non-null choices are preserved on reapply.
WITH configured_organizations AS (
  UPDATE public.organizations
  SET operating_country_code = 'BR',
      updated_at = now()
  WHERE id IN (
    '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'::uuid, -- Central Trabalhista
    'b246ef6f-6242-4011-a112-6d8783d2896a'::uuid  -- Viagi
  )
    AND operating_country_code IS NULL
  RETURNING id
)
INSERT INTO public.audit_logs (
  organization_id,
  entity_type,
  entity_id,
  action,
  old_data,
  new_data,
  changed_by_user_id
)
SELECT
  id,
  'organizations',
  id,
  'OPERATING_COUNTRY_MIGRATED',
  jsonb_build_object('operating_country_code', NULL),
  jsonb_build_object('operating_country_code', 'BR', 'rollout', 'regional_registry_pilot'),
  NULL
FROM configured_organizations;

INSERT INTO public.registry_provider_settings (
  organization_id,
  cpf_lookup_enabled
)
SELECT id, false
FROM public.organizations
WHERE id IN (
  '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'::uuid,
  'b246ef6f-6242-4011-a112-6d8783d2896a'::uuid
)
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO public.integration_feature_flags (
  flag_key,
  organization_id,
  enabled,
  metadata
)
SELECT
  'registry_lookup_br',
  id,
  true,
  jsonb_build_object('rollout', 'regional_registry_pilot')
FROM public.organizations
WHERE id IN (
  '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'::uuid,
  'b246ef6f-6242-4011-a112-6d8783d2896a'::uuid
)
ON CONFLICT DO NOTHING;

INSERT INTO public.registry_backfill_jobs (
  organization_id,
  kind,
  status,
  total_items
)
SELECT
  c.organization_id,
  'cpf',
  'pending',
  count(*)::integer
FROM public.contacts c
WHERE c.organization_id IN (
    '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'::uuid,
    'b246ef6f-6242-4011-a112-6d8783d2896a'::uuid
  )
  AND c.deleted_at IS NULL
  AND public.is_valid_cpf(c.cpf)
GROUP BY c.organization_id
ON CONFLICT (organization_id, kind)
  WHERE status IN ('pending', 'running', 'paused')
DO UPDATE SET
  total_items = EXCLUDED.total_items,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
