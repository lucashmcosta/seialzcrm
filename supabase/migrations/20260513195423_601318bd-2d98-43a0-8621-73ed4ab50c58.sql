
CREATE OR REPLACE FUNCTION public.get_marketing_ad_performance(
  p_organization_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_campaign_id text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  marketing_campaign_id uuid,
  organization_id uuid,
  ad_id text,
  campaign_id text,
  campaign_name text,
  adset_name text,
  ad_name text,
  creative_headline text,
  creative_body text,
  creative_thumbnail_url text,
  destination_url text,
  ad_status text,
  spend_brl numeric,
  impressions numeric,
  clicks numeric,
  conversations_started numeric,
  leads_total bigint,
  first_lead_at timestamptz,
  last_lead_at timestamptz,
  opps_total bigint,
  opps_open bigint,
  opps_won bigint,
  opps_lost bigint,
  revenue_won_brl numeric,
  pipeline_value_brl numeric,
  ctr_basis_points numeric,
  cpl_real_brl numeric,
  cac_brl numeric,
  roas numeric,
  lead_to_opp_pct numeric,
  opp_to_won_pct numeric,
  last_insight_date date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ad_leads AS (
    SELECT c.marketing_campaign_id,
      count(*) FILTER (WHERE c.deleted_at IS NULL) AS leads_total,
      min(c.created_at) AS first_lead_at,
      max(c.created_at) AS last_lead_at
    FROM contacts c
    WHERE c.organization_id = p_organization_id
      AND c.marketing_campaign_id IS NOT NULL
      AND (p_from IS NULL OR c.created_at >= p_from)
      AND (p_to   IS NULL OR c.created_at <  p_to)
    GROUP BY c.marketing_campaign_id
  ),
  ad_opps AS (
    SELECT c.marketing_campaign_id,
      count(DISTINCT o.id) FILTER (WHERE o.deleted_at IS NULL) AS opps_total,
      count(DISTINCT o.id) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'open'::opportunity_status) AS opps_open,
      count(DISTINCT o.id) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'won'::opportunity_status) AS opps_won,
      count(DISTINCT o.id) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'lost'::opportunity_status) AS opps_lost,
      COALESCE(sum(o.amount) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'won'::opportunity_status), 0)::numeric AS revenue_won,
      COALESCE(sum(o.amount) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'open'::opportunity_status), 0)::numeric AS pipeline_value
    FROM contacts c
    JOIN opportunities o ON o.contact_id = c.id
    WHERE c.organization_id = p_organization_id
      AND c.marketing_campaign_id IS NOT NULL
      AND (p_from IS NULL OR o.created_at >= p_from)
      AND (p_to   IS NULL OR o.created_at <  p_to)
    GROUP BY c.marketing_campaign_id
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
$$;
