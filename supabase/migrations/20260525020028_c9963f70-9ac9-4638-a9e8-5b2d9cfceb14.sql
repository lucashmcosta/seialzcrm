
-- ============================================================
-- 1. Tabela de ambiguidades
-- ============================================================
CREATE TABLE public.marketing_attribution_ambiguities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  match_kind text NOT NULL CHECK (match_kind IN ('external_id','ad_campaign_name')),
  candidate_ids uuid[] NOT NULL,
  candidate_count int NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_marketing_campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id)
);

CREATE INDEX idx_mkt_ambig_org_resolved ON public.marketing_attribution_ambiguities (organization_id, resolved);
CREATE INDEX idx_mkt_ambig_contact ON public.marketing_attribution_ambiguities (contact_id);

ALTER TABLE public.marketing_attribution_ambiguities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read ambiguities"
  ON public.marketing_attribution_ambiguities FOR SELECT
  USING (organization_id = ANY (public.current_user_org_ids()));

CREATE POLICY "org members update ambiguities"
  ON public.marketing_attribution_ambiguities FOR UPDATE
  USING (organization_id = ANY (public.current_user_org_ids()))
  WITH CHECK (organization_id = ANY (public.current_user_org_ids()));

-- INSERT/DELETE only via SECURITY DEFINER functions (no policy = denied to clients)

CREATE TRIGGER trg_mkt_ambig_updated_at
  BEFORE UPDATE ON public.marketing_attribution_ambiguities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. Resolver conservador (single-match-only)
-- ============================================================
-- Returns:
--   match_kind:      'external_id' | 'ad_campaign_name' | NULL
--   campaign_id:     uuid quando único, NULL quando ambíguo ou sem match
--   candidate_count: nº de candidatos encontrados na regra que disparou
--   candidate_ids:   uuid[] dos candidatos quando ambíguo (NULL se único ou zero)
CREATE OR REPLACE FUNCTION public.fn_resolve_marketing_campaign_id(
  _org_id uuid,
  _utm_source text,
  _utm_medium text,
  _utm_campaign text,
  _utm_content text,
  _utm_term text
)
RETURNS TABLE (
  match_kind text,
  campaign_id uuid,
  candidate_count int,
  candidate_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_count int;
BEGIN
  -- Step 1: external_id exato em utm_content ou utm_term
  IF _utm_content IS NOT NULL OR _utm_term IS NOT NULL THEN
    SELECT array_agg(mc.id), COUNT(*)::int
      INTO v_ids, v_count
    FROM public.marketing_campaigns mc
    WHERE mc.organization_id = _org_id
      AND mc.deleted_at IS NULL
      AND mc.external_id IS NOT NULL
      AND (mc.external_id = _utm_content OR mc.external_id = _utm_term);

    IF v_count = 1 THEN
      RETURN QUERY SELECT 'external_id'::text, v_ids[1], 1, NULL::uuid[];
      RETURN;
    ELSIF v_count > 1 THEN
      RETURN QUERY SELECT 'external_id'::text, NULL::uuid, v_count, v_ids;
      RETURN;
    END IF;
  END IF;

  -- Step 2: ad_name + campaign_name único
  IF _utm_campaign IS NOT NULL AND _utm_medium IS NOT NULL THEN
    SELECT array_agg(mc.id), COUNT(*)::int
      INTO v_ids, v_count
    FROM public.marketing_campaigns mc
    WHERE mc.organization_id = _org_id
      AND mc.deleted_at IS NULL
      AND mc.ad_name = _utm_campaign
      AND mc.campaign_name = _utm_medium;

    IF v_count = 1 THEN
      RETURN QUERY SELECT 'ad_campaign_name'::text, v_ids[1], 1, NULL::uuid[];
      RETURN;
    ELSIF v_count > 1 THEN
      RETURN QUERY SELECT 'ad_campaign_name'::text, NULL::uuid, v_count, v_ids;
      RETURN;
    END IF;
  END IF;

  -- Sem match
  RETURN QUERY SELECT NULL::text, NULL::uuid, 0, NULL::uuid[];
END;
$$;

-- ============================================================
-- 3. Log/atribuir para um contato
-- ============================================================
-- Retorna 'assigned' | 'ambiguous' | 'no_match' | 'already_assigned' | 'contact_not_found'
CREATE OR REPLACE FUNCTION public.fn_log_marketing_attribution_attempt(
  _org_id uuid,
  _contact_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  r record;
BEGIN
  SELECT id, organization_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, marketing_campaign_id
    INTO c
  FROM public.contacts
  WHERE id = _contact_id AND organization_id = _org_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN 'contact_not_found';
  END IF;

  IF c.marketing_campaign_id IS NOT NULL THEN
    RETURN 'already_assigned';
  END IF;

  IF c.utm_campaign IS NULL AND c.utm_content IS NULL AND c.utm_term IS NULL THEN
    RETURN 'no_match';
  END IF;

  SELECT * INTO r
  FROM public.fn_resolve_marketing_campaign_id(
    _org_id, c.utm_source, c.utm_medium, c.utm_campaign, c.utm_content, c.utm_term
  );

  IF r.campaign_id IS NOT NULL THEN
    UPDATE public.contacts
       SET marketing_campaign_id = r.campaign_id
     WHERE id = _contact_id;

    -- Limpa entrada ambígua antiga, se existir
    UPDATE public.marketing_attribution_ambiguities
       SET resolved = true,
           resolved_marketing_campaign_id = r.campaign_id,
           resolved_at = now()
     WHERE contact_id = _contact_id AND resolved = false;

    RETURN 'assigned';
  ELSIF r.candidate_count > 1 THEN
    INSERT INTO public.marketing_attribution_ambiguities (
      organization_id, contact_id,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      match_kind, candidate_ids, candidate_count
    ) VALUES (
      _org_id, _contact_id,
      c.utm_source, c.utm_medium, c.utm_campaign, c.utm_content, c.utm_term,
      r.match_kind, r.candidate_ids, r.candidate_count
    )
    ON CONFLICT (contact_id) DO UPDATE
       SET utm_source = EXCLUDED.utm_source,
           utm_medium = EXCLUDED.utm_medium,
           utm_campaign = EXCLUDED.utm_campaign,
           utm_content = EXCLUDED.utm_content,
           utm_term = EXCLUDED.utm_term,
           match_kind = EXCLUDED.match_kind,
           candidate_ids = EXCLUDED.candidate_ids,
           candidate_count = EXCLUDED.candidate_count,
           resolved = false,
           resolved_marketing_campaign_id = NULL,
           resolved_at = NULL,
           updated_at = now();
    RETURN 'ambiguous';
  ELSE
    RETURN 'no_match';
  END IF;
END;
$$;

-- ============================================================
-- 4. Dry-run multi-tenant (read-only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_marketing_attribution_dryrun()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  eligible_contacts bigint,
  unique_match bigint,
  ambiguous bigint,
  no_match bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT c.id AS contact_id, c.organization_id,
           c.utm_source, c.utm_medium, c.utm_campaign, c.utm_content, c.utm_term
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND c.marketing_campaign_id IS NULL
      AND (c.utm_campaign IS NOT NULL OR c.utm_content IS NOT NULL OR c.utm_term IS NOT NULL)
  ),
  resolved AS (
    SELECT
      cand.organization_id,
      cand.contact_id,
      r.campaign_id,
      r.candidate_count
    FROM candidates cand
    CROSS JOIN LATERAL public.fn_resolve_marketing_campaign_id(
      cand.organization_id, cand.utm_source, cand.utm_medium,
      cand.utm_campaign, cand.utm_content, cand.utm_term
    ) r
  )
  SELECT
    o.id AS organization_id,
    o.name AS organization_name,
    COUNT(*) FILTER (WHERE r.contact_id IS NOT NULL) AS eligible_contacts,
    COUNT(*) FILTER (WHERE r.campaign_id IS NOT NULL) AS unique_match,
    COUNT(*) FILTER (WHERE r.campaign_id IS NULL AND r.candidate_count > 1) AS ambiguous,
    COUNT(*) FILTER (WHERE r.candidate_count = 0) AS no_match
  FROM public.organizations o
  LEFT JOIN resolved r ON r.organization_id = o.id
  GROUP BY o.id, o.name
  HAVING COUNT(*) FILTER (WHERE r.contact_id IS NOT NULL) > 0
  ORDER BY eligible_contacts DESC;
$$;

-- ============================================================
-- 5. Top conflitos por organização (read-only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_marketing_attribution_top_conflicts(
  _org_id uuid DEFAULT NULL,
  _limit int DEFAULT 20
)
RETURNS TABLE (
  organization_id uuid,
  utm_campaign text,
  utm_medium text,
  utm_content text,
  utm_term text,
  contacts bigint,
  candidate_count int,
  candidate_ids uuid[],
  ad_names text,
  adset_names text,
  campaign_names text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT c.id AS contact_id, c.organization_id,
           c.utm_source, c.utm_medium, c.utm_campaign, c.utm_content, c.utm_term
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND c.marketing_campaign_id IS NULL
      AND (c.utm_campaign IS NOT NULL OR c.utm_content IS NOT NULL OR c.utm_term IS NOT NULL)
      AND (_org_id IS NULL OR c.organization_id = _org_id)
  ),
  resolved AS (
    SELECT cand.*, r.campaign_id, r.candidate_count, r.candidate_ids
    FROM candidates cand
    CROSS JOIN LATERAL public.fn_resolve_marketing_campaign_id(
      cand.organization_id, cand.utm_source, cand.utm_medium,
      cand.utm_campaign, cand.utm_content, cand.utm_term
    ) r
    WHERE r.campaign_id IS NULL AND r.candidate_count > 1
  )
  SELECT
    r.organization_id,
    r.utm_campaign,
    r.utm_medium,
    r.utm_content,
    r.utm_term,
    COUNT(*) AS contacts,
    MAX(r.candidate_count) AS candidate_count,
    (array_agg(DISTINCT mc.id))::uuid[] AS candidate_ids,
    string_agg(DISTINCT mc.ad_name, ' | ') AS ad_names,
    string_agg(DISTINCT mc.adset_name, ' | ') AS adset_names,
    string_agg(DISTINCT mc.campaign_name, ' | ') AS campaign_names
  FROM resolved r
  LEFT JOIN public.marketing_campaigns mc ON mc.id = ANY(r.candidate_ids)
  GROUP BY r.organization_id, r.utm_campaign, r.utm_medium, r.utm_content, r.utm_term
  ORDER BY contacts DESC
  LIMIT _limit;
$$;

-- Restringir execução a roles esperados
REVOKE ALL ON FUNCTION public.fn_log_marketing_attribution_attempt(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_log_marketing_attribution_attempt(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fn_marketing_attribution_dryrun() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_marketing_attribution_dryrun() TO service_role, authenticated;

REVOKE ALL ON FUNCTION public.fn_marketing_attribution_top_conflicts(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_marketing_attribution_top_conflicts(uuid, int) TO service_role, authenticated;
