CREATE OR REPLACE FUNCTION public.fn_resolve_marketing_campaign_id(
  _org_id uuid,
  _utm_source text,
  _utm_medium text,
  _utm_campaign text,
  _utm_content text,
  _utm_term text
)
RETURNS TABLE(match_kind text, campaign_id uuid, candidate_count integer, candidate_ids uuid[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_count int;
  v_campaign text := NULLIF(BTRIM(_utm_campaign), '');
  v_content text := NULLIF(BTRIM(_utm_content), '');
  v_term text := NULLIF(BTRIM(_utm_term), '');
  v_medium text := NULLIF(BTRIM(_utm_medium), '');
  v_values text[];
BEGIN
  v_values := ARRAY_REMOVE(ARRAY[v_campaign, v_content, v_term], NULL);

  IF COALESCE(array_length(v_values, 1), 0) = 0 THEN
    RETURN QUERY SELECT NULL::text, NULL::uuid, 0, NULL::uuid[];
    RETURN;
  END IF;

  -- 1) ID exato do anúncio: suporta utm_content={{ad.id}}, utm_term={{ad.id}} ou external_id espelhado.
  SELECT array_agg(mc.id ORDER BY mc.updated_at DESC), COUNT(*)::int
    INTO v_ids, v_count
  FROM public.marketing_campaigns mc
  WHERE mc.organization_id = _org_id
    AND mc.deleted_at IS NULL
    AND (
      mc.ad_id = ANY(v_values)
      OR mc.external_id = ANY(v_values)
    );

  IF v_count = 1 THEN
    RETURN QUERY SELECT 'ad_id'::text, v_ids[1], 1, NULL::uuid[];
    RETURN;
  ELSIF v_count > 1 THEN
    RETURN QUERY SELECT 'ad_id'::text, NULL::uuid, v_count, v_ids;
    RETURN;
  END IF;

  -- 2) Nome do anúncio + conjunto por ID ou nome: cobre a LP antiga que manda ad name + adset_id/adset_name.
  IF v_campaign IS NOT NULL THEN
    SELECT array_agg(mc.id ORDER BY mc.updated_at DESC), COUNT(*)::int
      INTO v_ids, v_count
    FROM public.marketing_campaigns mc
    WHERE mc.organization_id = _org_id
      AND mc.deleted_at IS NULL
      AND mc.ad_name = v_campaign
      AND (
        mc.adset_id = ANY(v_values)
        OR mc.adset_name = ANY(v_values)
      );

    IF v_count = 1 THEN
      RETURN QUERY SELECT 'ad_name_adset'::text, v_ids[1], 1, NULL::uuid[];
      RETURN;
    ELSIF v_count > 1 THEN
      RETURN QUERY SELECT 'ad_name_adset'::text, NULL::uuid, v_count, v_ids;
      RETURN;
    END IF;
  END IF;

  -- 3) Compatibilidade com template legado: nome do anúncio + nome/ID da campanha.
  IF v_campaign IS NOT NULL THEN
    SELECT array_agg(mc.id ORDER BY mc.updated_at DESC), COUNT(*)::int
      INTO v_ids, v_count
    FROM public.marketing_campaigns mc
    WHERE mc.organization_id = _org_id
      AND mc.deleted_at IS NULL
      AND mc.ad_name = v_campaign
      AND (
        mc.campaign_name = v_medium
        OR mc.campaign_name = v_content
        OR mc.campaign_id = ANY(v_values)
      );

    IF v_count = 1 THEN
      RETURN QUERY SELECT 'ad_name_campaign'::text, v_ids[1], 1, NULL::uuid[];
      RETURN;
    ELSIF v_count > 1 THEN
      RETURN QUERY SELECT 'ad_name_campaign'::text, NULL::uuid, v_count, v_ids;
      RETURN;
    END IF;
  END IF;

  -- 4) Só conjunto por ID/nome, apenas se o conjunto tiver um único anúncio candidato.
  SELECT array_agg(mc.id ORDER BY mc.updated_at DESC), COUNT(*)::int
    INTO v_ids, v_count
  FROM public.marketing_campaigns mc
  WHERE mc.organization_id = _org_id
    AND mc.deleted_at IS NULL
    AND (
      mc.adset_id = ANY(v_values)
      OR mc.adset_name = ANY(v_values)
    );

  IF v_count = 1 THEN
    RETURN QUERY SELECT 'adset_unique'::text, v_ids[1], 1, NULL::uuid[];
    RETURN;
  ELSIF v_count > 1 THEN
    RETURN QUERY SELECT 'adset_ambiguous'::text, NULL::uuid, v_count, v_ids;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::text, NULL::uuid, 0, NULL::uuid[];
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_log_marketing_attribution_attempt(_org_id uuid, _contact_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  r record;
BEGIN
  SELECT id, organization_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         meta_campaign_id, meta_adset_id, meta_ad_id, marketing_campaign_id
    INTO c
  FROM public.contacts
  WHERE id = _contact_id AND organization_id = _org_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN 'contact_not_found';
  END IF;

  IF c.marketing_campaign_id IS NOT NULL THEN
    RETURN 'already_assigned';
  END IF;

  IF c.utm_campaign IS NULL AND c.utm_content IS NULL AND c.utm_term IS NULL
     AND c.meta_campaign_id IS NULL AND c.meta_adset_id IS NULL AND c.meta_ad_id IS NULL THEN
    RETURN 'no_match';
  END IF;

  SELECT * INTO r
  FROM public.fn_resolve_marketing_campaign_id(
    _org_id,
    c.utm_source,
    c.utm_medium,
    COALESCE(NULLIF(BTRIM(c.utm_campaign), ''), NULLIF(BTRIM(c.meta_campaign_id), '')),
    COALESCE(NULLIF(BTRIM(c.utm_content), ''), NULLIF(BTRIM(c.meta_adset_id), '')),
    COALESCE(NULLIF(BTRIM(c.utm_term), ''), NULLIF(BTRIM(c.meta_ad_id), ''))
  );

  IF r.campaign_id IS NOT NULL THEN
    UPDATE public.contacts
       SET marketing_campaign_id = r.campaign_id
     WHERE id = _contact_id;

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
$function$;