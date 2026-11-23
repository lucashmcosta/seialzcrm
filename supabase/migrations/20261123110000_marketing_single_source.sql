-- Origens, passo 1e: painéis de marketing leem a fonte única.
-- Ponte: org com origens ligadas -> commercial_attributions (lead pelo contato, venda pela oportunidade,
-- incluindo herdadas); demais orgs -> contacts.marketing_campaign_id (como antes).

CREATE OR REPLACE FUNCTION public.marketing_attributed_contacts(p_org uuid)
RETURNS TABLE(contact_id uuid, campaign_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND NOT (p_org = ANY(current_user_org_ids())) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=p_org AND enabled) THEN
  RETURN QUERY SELECT a.entity_id, a.campaign_id FROM commercial_attributions a
   WHERE a.organization_id=p_org AND a.entity_type='contact' AND a.campaign_id IS NOT NULL;
 ELSE
  RETURN QUERY SELECT c.id, c.marketing_campaign_id FROM contacts c
   WHERE c.organization_id=p_org AND c.marketing_campaign_id IS NOT NULL;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_attributed_opportunities(p_org uuid)
RETURNS TABLE(opportunity_id uuid, campaign_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND NOT (p_org = ANY(current_user_org_ids())) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=p_org AND enabled) THEN
  -- Venda sem campanha própria usa a do contato quando a origem é a mesma (ou não identificada). Manual manda.
  RETURN QUERY SELECT x.id, x.campaign_id FROM (
   SELECT o.id, CASE WHEN oa.method='manual' THEN oa.campaign_id
     ELSE coalesce(oa.campaign_id, CASE WHEN oa.origin_id IS NULL OR oa.origin_id=ca.origin_id THEN ca.campaign_id END) END AS campaign_id
   FROM opportunities o
   LEFT JOIN commercial_attributions oa ON oa.organization_id=p_org AND oa.entity_type='opportunity' AND oa.entity_id=o.id
   LEFT JOIN commercial_attributions ca ON ca.organization_id=p_org AND ca.entity_type='contact' AND ca.entity_id=o.contact_id
   WHERE o.organization_id=p_org) x
  WHERE x.campaign_id IS NOT NULL;
 ELSE
  RETURN QUERY SELECT o.id, c.marketing_campaign_id FROM opportunities o JOIN contacts c ON c.id=o.contact_id
   WHERE o.organization_id=p_org AND c.marketing_campaign_id IS NOT NULL;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.marketing_attributed_contacts(uuid), public.marketing_attributed_opportunities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_attributed_contacts(uuid), public.marketing_attributed_opportunities(uuid) TO authenticated, service_role;

-- IDs de leads/vendas de um anúncio (a tela busca os registros com as permissões do usuário).
CREATE OR REPLACE FUNCTION public.marketing_ad_entity_ids(p_campaign uuid, p_type text)
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; r uuid[];
BEGIN
 SELECT organization_id INTO v_org FROM marketing_campaigns WHERE id=p_campaign;
 IF v_org IS NULL OR NOT (v_org = ANY(current_user_org_ids())) THEN RETURN '{}'; END IF;
 IF p_type='contact' THEN
  SELECT coalesce(array_agg(contact_id),'{}') INTO r FROM marketing_attributed_contacts(v_org) WHERE campaign_id=p_campaign;
 ELSE
  SELECT coalesce(array_agg(opportunity_id),'{}') INTO r FROM marketing_attributed_opportunities(v_org) WHERE campaign_id=p_campaign;
 END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.marketing_ad_entity_ids(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_ad_entity_ids(uuid,text) TO authenticated;

-- Visão geral: leads (contatos com campanha que chegaram no período), abertas desses leads, vendas pela data da venda.
CREATE OR REPLACE FUNCTION public.get_marketing_overview_attribution(p_org uuid, p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
 IF NOT (p_org = ANY(current_user_org_ids())) THEN RETURN NULL; END IF;
 WITH leads AS (
  SELECT c.id FROM marketing_attributed_contacts(p_org) b JOIN contacts c ON c.id=b.contact_id
  WHERE c.deleted_at IS NULL AND c.created_at>=p_from AND c.created_at<=p_to
 ), opps AS (
  SELECT o.* FROM marketing_attributed_opportunities(p_org) b JOIN opportunities o ON o.id=b.opportunity_id
  WHERE o.deleted_at IS NULL
 )
 SELECT jsonb_build_object(
  'leads',(SELECT count(*) FROM leads),
  'opps_open',(SELECT count(*) FROM opps WHERE status='open' AND contact_id IN (SELECT id FROM leads)),
  'wins',(SELECT count(*) FROM opps WHERE status='won' AND won_at>=p_from AND won_at<=p_to),
  'revenue',(SELECT coalesce(sum(amount),0) FROM opps WHERE status='won' AND won_at>=p_from AND won_at<=p_to)) INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.get_marketing_overview_attribution(uuid,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_marketing_overview_attribution(uuid,timestamptz,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_marketing_ad_performance(p_organization_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT NULL::text, p_campaign_id text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 200)
 RETURNS TABLE(marketing_campaign_id uuid, organization_id uuid, ad_id text, campaign_id text, campaign_name text, adset_name text, ad_name text, creative_headline text, creative_body text, creative_thumbnail_url text, destination_url text, ad_status text, spend_brl numeric, impressions numeric, clicks numeric, conversations_started numeric, leads_total bigint, first_lead_at timestamp with time zone, last_lead_at timestamp with time zone, opps_total bigint, opps_open bigint, opps_won bigint, opps_lost bigint, revenue_won_brl numeric, pipeline_value_brl numeric, ctr_basis_points numeric, cpl_real_brl numeric, cac_brl numeric, roas numeric, lead_to_opp_pct numeric, opp_to_won_pct numeric, last_insight_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_organization_id IS NULL
     OR NOT (p_organization_id = ANY(public.current_user_org_ids()))
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ad_leads AS (
    SELECT b.campaign_id AS marketing_campaign_id,
      count(*) FILTER (WHERE c.deleted_at IS NULL) AS leads_total,
      min(c.created_at) AS first_lead_at,
      max(c.created_at) AS last_lead_at
    FROM marketing_attributed_contacts(p_organization_id) b
    JOIN contacts c ON c.id = b.contact_id
    WHERE (p_from IS NULL OR c.created_at >= p_from)
      AND (p_to   IS NULL OR c.created_at <  p_to)
    GROUP BY b.campaign_id
  ),
  ad_opps AS (
    SELECT b.campaign_id AS marketing_campaign_id,
      count(DISTINCT o.id) FILTER (WHERE o.deleted_at IS NULL) AS opps_total,
      count(DISTINCT o.id) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'open'::opportunity_status) AS opps_open,
      count(DISTINCT o.id) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'won'::opportunity_status) AS opps_won,
      count(DISTINCT o.id) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'lost'::opportunity_status) AS opps_lost,
      COALESCE(sum(o.amount) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'won'::opportunity_status), 0)::numeric AS revenue_won,
      COALESCE(sum(o.amount) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'open'::opportunity_status), 0)::numeric AS pipeline_value
    FROM marketing_attributed_opportunities(p_organization_id) b
    JOIN opportunities o ON o.id = b.opportunity_id
    WHERE (p_from IS NULL OR o.created_at >= p_from)
      AND (p_to   IS NULL OR o.created_at <  p_to)
    GROUP BY b.campaign_id
  ),
  ad_insights AS (
    SELECT i.marketing_campaign_id,
      sum(i.spend_cents) AS spend_cents_sum,
      sum(i.impressions) AS impressions_sum,
      sum(i.clicks) AS clicks_sum,
      sum(i.conversations_started) AS conversations_sum,
      max(i.date) AS last_insight_date
    FROM marketing_campaign_insights_daily i
    WHERE i.organization_id = p_organization_id
      AND (p_from IS NULL OR i.date >= p_from::date)
      AND (p_to   IS NULL OR i.date <  p_to::date)
    GROUP BY i.marketing_campaign_id
  )
  SELECT
    mc.id,
    mc.organization_id,
    mc.external_id,
    mc.campaign_id,
    mc.campaign_name,
    mc.adset_name,
    mc.ad_name,
    mc.creative_headline,
    mc.creative_body,
    mc.creative_thumbnail_url,
    mc.destination_url,
    mc.status,
    COALESCE(ai.spend_cents_sum, 0)::numeric / 100.0,
    COALESCE(ai.impressions_sum, 0)::numeric,
    COALESCE(ai.clicks_sum, 0)::numeric,
    COALESCE(ai.conversations_sum, 0)::numeric,
    COALESCE(al.leads_total, 0)::bigint,
    al.first_lead_at,
    al.last_lead_at,
    COALESCE(ao.opps_total, 0)::bigint,
    COALESCE(ao.opps_open, 0)::bigint,
    COALESCE(ao.opps_won, 0)::bigint,
    COALESCE(ao.opps_lost, 0)::bigint,
    COALESCE(ao.revenue_won, 0)::numeric,
    COALESCE(ao.pipeline_value, 0)::numeric,
    CASE WHEN COALESCE(ai.impressions_sum, 0) > 0
      THEN round(COALESCE(ai.clicks_sum, 0)::numeric * 10000.0 / ai.impressions_sum, 2) END,
    CASE WHEN COALESCE(al.leads_total, 0) > 0
      THEN round(COALESCE(ai.spend_cents_sum, 0)::numeric / al.leads_total / 100.0, 2) END,
    CASE WHEN COALESCE(ao.opps_won, 0) > 0
      THEN round(COALESCE(ai.spend_cents_sum, 0)::numeric / ao.opps_won / 100.0, 2) END,
    CASE WHEN COALESCE(ai.spend_cents_sum, 0) > 0
      THEN round(COALESCE(ao.revenue_won, 0)::numeric * 100.0 / ai.spend_cents_sum, 2) END,
    CASE WHEN COALESCE(al.leads_total, 0) > 0
      THEN round(COALESCE(ao.opps_total, 0)::numeric * 100.0 / al.leads_total, 2) END,
    CASE WHEN COALESCE(ao.opps_total, 0) > 0
      THEN round(COALESCE(ao.opps_won, 0)::numeric * 100.0 / ao.opps_total, 2) END,
    ai.last_insight_date
  FROM marketing_campaigns mc
    LEFT JOIN ad_leads al ON al.marketing_campaign_id = mc.id
    LEFT JOIN ad_opps   ao ON ao.marketing_campaign_id = mc.id
    LEFT JOIN ad_insights ai ON ai.marketing_campaign_id = mc.id
  WHERE mc.organization_id = p_organization_id
    AND mc.deleted_at IS NULL
    AND (p_status IS NULL OR p_status = 'all' OR mc.status = p_status)
    AND (p_campaign_id IS NULL OR p_campaign_id = 'all' OR mc.campaign_id = p_campaign_id)
    AND (p_search IS NULL OR p_search = '' OR mc.ad_name ILIKE '%' || p_search || '%')
  ORDER BY COALESCE(ai.spend_cents_sum, 0) DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
END;
$function$;

CREATE OR REPLACE VIEW public.vw_marketing_ad_performance WITH (security_invoker=true) AS
WITH ad_leads AS (
         SELECT c.organization_id,
            b.campaign_id AS marketing_campaign_id,
            count(*) FILTER (WHERE (c.deleted_at IS NULL)) AS leads_total,
            count(*) FILTER (WHERE ((c.deleted_at IS NULL) AND (c.email IS NOT NULL))) AS leads_with_email,
            min(c.created_at) AS first_lead_at,
            max(c.created_at) AS last_lead_at
           FROM organizations org
             CROSS JOIN LATERAL marketing_attributed_contacts(org.id) b
             JOIN contacts c ON c.id = b.contact_id
          WHERE org.id = ANY (current_user_org_ids())
          GROUP BY c.organization_id, b.campaign_id
        ), ad_opps AS (
         SELECT o.organization_id,
            b.campaign_id AS marketing_campaign_id,
            count(DISTINCT o.id) FILTER (WHERE (o.deleted_at IS NULL)) AS opps_total,
            count(DISTINCT o.id) FILTER (WHERE ((o.deleted_at IS NULL) AND (o.status = 'open'::opportunity_status))) AS opps_open,
            count(DISTINCT o.id) FILTER (WHERE ((o.deleted_at IS NULL) AND (o.status = 'won'::opportunity_status))) AS opps_won,
            count(DISTINCT o.id) FILTER (WHERE ((o.deleted_at IS NULL) AND (o.status = 'lost'::opportunity_status))) AS opps_lost,
            COALESCE(sum(o.amount) FILTER (WHERE ((o.deleted_at IS NULL) AND (o.status = 'won'::opportunity_status))), (0)::numeric) AS revenue_won,
            COALESCE(sum(o.amount) FILTER (WHERE ((o.deleted_at IS NULL) AND (o.status = 'open'::opportunity_status))), (0)::numeric) AS pipeline_value
           FROM organizations org
             CROSS JOIN LATERAL marketing_attributed_opportunities(org.id) b
             JOIN opportunities o ON o.id = b.opportunity_id
          WHERE org.id = ANY (current_user_org_ids())
          GROUP BY o.organization_id, b.campaign_id
        ), ad_insights AS (
         SELECT marketing_campaign_insights_daily.organization_id,
            marketing_campaign_insights_daily.marketing_campaign_id,
            sum(marketing_campaign_insights_daily.spend_cents) AS spend_cents_sum_daily,
            sum(marketing_campaign_insights_daily.impressions) AS impressions_sum_daily,
            sum(marketing_campaign_insights_daily.clicks) AS clicks_sum_daily,
            sum(marketing_campaign_insights_daily.conversations_started) AS conversations_started_sum_daily,
            max(marketing_campaign_insights_daily.date) AS last_insight_date
           FROM marketing_campaign_insights_daily
          GROUP BY marketing_campaign_insights_daily.organization_id, marketing_campaign_insights_daily.marketing_campaign_id
        )
 SELECT mc.id AS marketing_campaign_id,
    mc.organization_id,
    mc.platform,
    mc.channel,
    mc.external_id AS ad_id,
    mc.campaign_id,
    mc.campaign_name,
    mc.campaign_objective,
    mc.adset_id,
    mc.adset_name,
    mc.ad_name,
    mc.creative_headline,
    mc.creative_body,
    mc.creative_thumbnail_url,
    mc.destination_url,
    mc.status AS ad_status,
    mc.sync_status,
    COALESCE(ai.spend_cents_sum_daily, (mc.spend_total_cents)::numeric, (0)::numeric) AS spend_cents,
    (COALESCE(ai.spend_cents_sum_daily, (mc.spend_total_cents)::numeric, (0)::numeric) / 100.0) AS spend_brl,
    COALESCE(ai.impressions_sum_daily, (mc.impressions)::numeric, (0)::numeric) AS impressions,
    COALESCE(ai.clicks_sum_daily, (mc.clicks)::numeric, (0)::numeric) AS clicks,
    COALESCE(ai.conversations_started_sum_daily, (0)::numeric) AS conversations_started,
    COALESCE(al.leads_total, (0)::bigint) AS leads_total,
    COALESCE(al.leads_with_email, (0)::bigint) AS leads_with_email,
    al.first_lead_at,
    al.last_lead_at,
    COALESCE(ao.opps_total, (0)::bigint) AS opps_total,
    COALESCE(ao.opps_open, (0)::bigint) AS opps_open,
    COALESCE(ao.opps_won, (0)::bigint) AS opps_won,
    COALESCE(ao.opps_lost, (0)::bigint) AS opps_lost,
    COALESCE(ao.revenue_won, (0)::numeric) AS revenue_won_brl,
    COALESCE(ao.pipeline_value, (0)::numeric) AS pipeline_value_brl,
        CASE
            WHEN (COALESCE(ai.impressions_sum_daily, (mc.impressions)::numeric, (0)::numeric) > (0)::numeric) THEN round(((COALESCE(ai.clicks_sum_daily, (mc.clicks)::numeric, (0)::numeric) * 10000.0) / COALESCE(ai.impressions_sum_daily, (mc.impressions)::numeric, (0)::numeric)), 2)
            ELSE NULL::numeric
        END AS ctr_basis_points,
        CASE
            WHEN (COALESCE(ai.clicks_sum_daily, (mc.clicks)::numeric, (0)::numeric) > (0)::numeric) THEN round(((COALESCE(ai.spend_cents_sum_daily, (mc.spend_total_cents)::numeric, (0)::numeric) / COALESCE(ai.clicks_sum_daily, (mc.clicks)::numeric, (0)::numeric)) / 100.0), 2)
            ELSE NULL::numeric
        END AS cpc_brl,
        CASE
            WHEN (COALESCE(ai.impressions_sum_daily, (mc.impressions)::numeric, (0)::numeric) > (0)::numeric) THEN round((((COALESCE(ai.spend_cents_sum_daily, (mc.spend_total_cents)::numeric, (0)::numeric) * 1000.0) / COALESCE(ai.impressions_sum_daily, (mc.impressions)::numeric, (0)::numeric)) / 100.0), 2)
            ELSE NULL::numeric
        END AS cpm_brl,
        CASE
            WHEN (COALESCE(al.leads_total, (0)::bigint) > 0) THEN round(((COALESCE(ai.spend_cents_sum_daily, (mc.spend_total_cents)::numeric, (0)::numeric) / (al.leads_total)::numeric) / 100.0), 2)
            ELSE NULL::numeric
        END AS cpl_real_brl,
        CASE
            WHEN (COALESCE(ao.opps_won, (0)::bigint) > 0) THEN round(((COALESCE(ai.spend_cents_sum_daily, (mc.spend_total_cents)::numeric, (0)::numeric) / (ao.opps_won)::numeric) / 100.0), 2)
            ELSE NULL::numeric
        END AS cac_brl,
        CASE
            WHEN (COALESCE(ai.spend_cents_sum_daily, (mc.spend_total_cents)::numeric, (0)::numeric) > (0)::numeric) THEN round(((COALESCE(ao.revenue_won, (0)::numeric) * 100.0) / COALESCE(ai.spend_cents_sum_daily, (mc.spend_total_cents)::numeric, (0)::numeric)), 2)
            ELSE NULL::numeric
        END AS roas,
        CASE
            WHEN (COALESCE(al.leads_total, (0)::bigint) > 0) THEN round((((COALESCE(ao.opps_total, (0)::bigint))::numeric * 100.0) / (al.leads_total)::numeric), 2)
            ELSE NULL::numeric
        END AS lead_to_opp_pct,
        CASE
            WHEN (COALESCE(ao.opps_total, (0)::bigint) > 0) THEN round((((COALESCE(ao.opps_won, (0)::bigint))::numeric * 100.0) / (ao.opps_total)::numeric), 2)
            ELSE NULL::numeric
        END AS opp_to_won_pct,
    mc.metrics_synced_at,
    ai.last_insight_date,
    mc.created_at,
    mc.updated_at
   FROM (((marketing_campaigns mc
     LEFT JOIN ad_leads al ON (((al.marketing_campaign_id = mc.id) AND (al.organization_id = mc.organization_id))))
     LEFT JOIN ad_opps ao ON (((ao.marketing_campaign_id = mc.id) AND (ao.organization_id = mc.organization_id))))
     LEFT JOIN ad_insights ai ON (((ai.marketing_campaign_id = mc.id) AND (ai.organization_id = mc.organization_id))))
  WHERE (mc.deleted_at IS NULL);
