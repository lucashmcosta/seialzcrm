-- Relatório de origem das vendas (fase 4): leads, vendas, receita e gasto por Origem,
-- abrindo campanha › conjunto › anúncio. Crédito na oportunidade; sem atribuição própria,
-- usa a do contato (mesma regra de marketing_attributed_opportunities). Manual manda.
BEGIN;
CREATE OR REPLACE FUNCTION public.rpc_origin_report_v1(p_org uuid, p_from date, p_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tz text;
BEGIN
 IF NOT (p_org = ANY(current_user_org_ids())) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
 IF p_to < p_from OR p_to - p_from > 400 THEN RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023'; END IF;
 SELECT COALESCE(NULLIF(timezone, ''), 'America/Sao_Paulo') INTO v_tz FROM organizations WHERE id = p_org;
 RETURN COALESCE((
  WITH opp AS (
   SELECT o.id, o.status, o.amount, (o.created_at AT TIME ZONE v_tz)::date AS created_day, (o.won_at AT TIME ZONE v_tz)::date AS won_day,
    CASE WHEN oa.method = 'manual' THEN oa.origin_id ELSE COALESCE(oa.origin_id, ca.origin_id) END AS origin_id,
    CASE WHEN oa.method = 'manual' THEN oa.campaign_id
     ELSE COALESCE(oa.campaign_id, CASE WHEN oa.origin_id IS NULL OR oa.origin_id = ca.origin_id THEN ca.campaign_id END) END AS campaign_id
   FROM opportunities o
   LEFT JOIN commercial_attributions oa ON oa.organization_id = p_org AND oa.entity_type = 'opportunity' AND oa.entity_id = o.id
   LEFT JOIN commercial_attributions ca ON ca.organization_id = p_org AND ca.entity_type = 'contact' AND ca.entity_id = o.contact_id
   WHERE o.organization_id = p_org AND o.deleted_at IS NULL
     AND ((o.created_at AT TIME ZONE v_tz)::date BETWEEN p_from AND p_to
       OR (o.status = 'won' AND (o.won_at AT TIME ZONE v_tz)::date BETWEEN p_from AND p_to))
  ), sales AS (
   SELECT origin_id, campaign_id,
    count(*) FILTER (WHERE created_day BETWEEN p_from AND p_to) AS leads,
    count(*) FILTER (WHERE status = 'won' AND won_day BETWEEN p_from AND p_to) AS won,
    COALESCE(sum(amount) FILTER (WHERE status = 'won' AND won_day BETWEEN p_from AND p_to), 0) AS revenue
   FROM opp GROUP BY origin_id, campaign_id
  ), spend AS (
   SELECT d.marketing_campaign_id AS campaign_id, sum(d.spend_cents) AS spend_cents
   FROM marketing_campaign_insights_daily d
   WHERE d.organization_id = p_org AND d.date BETWEEN p_from AND p_to
   GROUP BY d.marketing_campaign_id HAVING sum(d.spend_cents) > 0
  ), paid_origin AS (
   SELECT code, id FROM commercial_origins WHERE organization_id = p_org AND code IN ('meta_ads', 'google_ads')
  ), rows AS (
   SELECT COALESCE(s.origin_id, po.id) AS origin_id, COALESCE(s.campaign_id, sp.campaign_id) AS campaign_id,
    COALESCE(s.leads, 0) AS leads, COALESCE(s.won, 0) AS won, COALESCE(s.revenue, 0) AS revenue, COALESCE(sp.spend_cents, 0) AS spend_cents
   FROM sales s
   FULL JOIN spend sp ON sp.campaign_id = s.campaign_id
   LEFT JOIN marketing_campaigns m2 ON m2.id = sp.campaign_id AND s.campaign_id IS NULL
   LEFT JOIN paid_origin po ON s.campaign_id IS NULL
     AND po.code = CASE WHEN lower(m2.platform) IN ('google', 'google_ads') THEN 'google_ads' ELSE 'meta_ads' END
  )
  SELECT jsonb_agg(jsonb_build_object(
    'origin_code', co.code, 'origin_name', co.name,
    'campaign_id', r.campaign_id, 'campaign_name', m.campaign_name, 'adset_name', m.adset_name,
    'ad_name', COALESCE(m.ad_name, m.display_name), 'thumbnail', m.creative_thumbnail_url,
    'leads', r.leads, 'won', r.won, 'revenue', r.revenue, 'spend', round(r.spend_cents / 100.0, 2))
    ORDER BY r.spend_cents DESC, r.won DESC, r.leads DESC)
  FROM rows r
  LEFT JOIN commercial_origins co ON co.id = r.origin_id
  LEFT JOIN marketing_campaigns m ON m.id = r.campaign_id
  WHERE r.leads > 0 OR r.won > 0 OR r.spend_cents > 0
 ), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.rpc_origin_report_v1(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_origin_report_v1(uuid, date, date) TO authenticated;
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('20261125120000','origin_report') ON CONFLICT DO NOTHING;
COMMIT;
