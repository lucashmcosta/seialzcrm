-- rpc_search_contacts: busca otimizada de contatos com 3 branches distintos
-- Rollback: DROP FUNCTION IF EXISTS public.rpc_search_contacts(uuid, text, uuid, text, timestamptz, timestamptz, integer, integer);

CREATE OR REPLACE FUNCTION public.rpc_search_contacts(
  p_organization_id uuid,
  p_search          text        DEFAULT NULL,
  p_owner_user_id   uuid        DEFAULT NULL,
  p_lifecycle_stage text        DEFAULT NULL,
  p_created_from    timestamptz DEFAULT NULL,
  p_created_to      timestamptz DEFAULT NULL,
  p_limit           integer     DEFAULT 50,
  p_offset          integer     DEFAULT 0
)
RETURNS TABLE (
  id              uuid,
  full_name       text,
  email           text,
  phone           text,
  company_name    text,
  lifecycle_stage text,
  owner_user_id   uuid,
  created_at      timestamptz,
  total_count     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := current_user_id();
  v_term     text;
  v_digits   text;
  v_is_phone boolean := false;
  v_pattern  text;
  v_limit    integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset   integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  -- Membership guard
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = v_user_id
      AND uo.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'not_a_member_of_organization';
  END IF;

  -- Normalizar termo
  v_term := NULLIF(btrim(COALESCE(p_search, '')), '');

  IF v_term IS NOT NULL THEN
    v_digits := regexp_replace(v_term, '\D', '', 'g');
    -- Telefone: termo com maioria dígitos e >= 4 dígitos
    IF length(v_digits) >= 4
       AND v_term ~ '^[\d\s()+\-]+$' THEN
      v_is_phone := true;
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- BRANCH 1: sem busca textual
  ---------------------------------------------------------------------------
  IF v_term IS NULL THEN
    RETURN QUERY
    WITH base AS (
      SELECT c.id, c.full_name, c.email, c.phone, c.company_name,
             c.lifecycle_stage, c.owner_user_id, c.created_at
      FROM public.contacts c
      WHERE c.organization_id = p_organization_id
        AND c.deleted_at IS NULL
        AND (p_owner_user_id   IS NULL OR c.owner_user_id   = p_owner_user_id)
        AND (p_lifecycle_stage IS NULL OR c.lifecycle_stage = p_lifecycle_stage)
        AND (p_created_from    IS NULL OR c.created_at     >= p_created_from)
        AND (p_created_to      IS NULL OR c.created_at     <= p_created_to)
    ),
    counted AS (SELECT count(*)::bigint AS n FROM base)
    SELECT b.id, b.full_name, b.email, b.phone, b.company_name,
           b.lifecycle_stage, b.owner_user_id, b.created_at,
           (SELECT n FROM counted) AS total_count
    FROM base b
    ORDER BY b.created_at DESC
    LIMIT v_limit OFFSET v_offset;

  ---------------------------------------------------------------------------
  -- BRANCH 2: busca por telefone (somente phone_digits)
  ---------------------------------------------------------------------------
  ELSIF v_is_phone THEN
    v_pattern := '%' || v_digits || '%';

    RETURN QUERY
    WITH base AS (
      SELECT c.id, c.full_name, c.email, c.phone, c.company_name,
             c.lifecycle_stage, c.owner_user_id, c.created_at
      FROM public.contacts c
      WHERE c.organization_id = p_organization_id
        AND c.deleted_at IS NULL
        AND c.phone_digits ILIKE v_pattern
        AND (p_owner_user_id   IS NULL OR c.owner_user_id   = p_owner_user_id)
        AND (p_lifecycle_stage IS NULL OR c.lifecycle_stage = p_lifecycle_stage)
        AND (p_created_from    IS NULL OR c.created_at     >= p_created_from)
        AND (p_created_to      IS NULL OR c.created_at     <= p_created_to)
    ),
    counted AS (SELECT count(*)::bigint AS n FROM base)
    SELECT b.id, b.full_name, b.email, b.phone, b.company_name,
           b.lifecycle_stage, b.owner_user_id, b.created_at,
           (SELECT n FROM counted) AS total_count
    FROM base b
    ORDER BY b.created_at DESC
    LIMIT v_limit OFFSET v_offset;

  ---------------------------------------------------------------------------
  -- BRANCH 3: busca textual (search_name / search_email)
  ---------------------------------------------------------------------------
  ELSE
    v_pattern := '%' || lower(v_term) || '%';

    RETURN QUERY
    WITH base AS (
      SELECT c.id, c.full_name, c.email, c.phone, c.company_name,
             c.lifecycle_stage, c.owner_user_id, c.created_at
      FROM public.contacts c
      WHERE c.organization_id = p_organization_id
        AND c.deleted_at IS NULL
        AND (c.search_name ILIKE v_pattern OR c.search_email ILIKE v_pattern)
        AND (p_owner_user_id   IS NULL OR c.owner_user_id   = p_owner_user_id)
        AND (p_lifecycle_stage IS NULL OR c.lifecycle_stage = p_lifecycle_stage)
        AND (p_created_from    IS NULL OR c.created_at     >= p_created_from)
        AND (p_created_to      IS NULL OR c.created_at     <= p_created_to)
    ),
    counted AS (SELECT count(*)::bigint AS n FROM base)
    SELECT b.id, b.full_name, b.email, b.phone, b.company_name,
           b.lifecycle_stage, b.owner_user_id, b.created_at,
           (SELECT n FROM counted) AS total_count
    FROM base b
    ORDER BY b.created_at DESC
    LIMIT v_limit OFFSET v_offset;
  END IF;
END;
$$;

-- Hardening
REVOKE ALL ON FUNCTION public.rpc_search_contacts(uuid, text, uuid, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_search_contacts(uuid, text, uuid, text, timestamptz, timestamptz, integer, integer) TO authenticated;