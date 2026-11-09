-- Dados da Visão Geral da Seialz Intelligence: objeções, sinais de compra por etapa e o que
-- diferencia negócios ganhos de perdidos. Conta só a fala do cliente (inbound), sem análises de
-- confiança baixa, pela data da mensagem. Os eventos quase nunca têm opportunity_id preenchido,
-- então o vínculo com o negócio é pelo contato, dentro do período em que o negócio esteve aberto.
CREATE OR REPLACE FUNCTION public.rpc_intelligence_insights(p_org uuid, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_known text[] := ARRAY['price','timing','authority','trust','fit','competitor','no_need','documentacao_faltante',
    'medo_de_processar_empregador','desconfianca_advogado','prazo_prescricional','valor_indenizacao_baixo'];
  v_result jsonb;
BEGIN
  IF NOT (p_org = ANY(public.current_user_org_ids())) THEN
    RETURN NULL;
  END IF;

  WITH analyses AS MATERIALIZED (
    SELECT a.conversation_stage, a.sentiment,
           jsonb_array_length(COALESCE(a.buying_signals, '[]'::jsonb)) > 0 AS has_signal,
           CASE WHEN a.objection_type IS NULL THEN NULL
                WHEN a.objection_type = ANY(v_known) THEN a.objection_type ELSE 'other' END AS objection
    FROM messages m
    JOIN message_analyses a ON a.message_id = m.id AND a.analysis_version = 'v2.1.0'
    WHERE m.organization_id = p_org AND m.direction = 'inbound' AND m.created_at >= v_since
      AND a.confidence IS DISTINCT FROM 'low'
  ),
  closed AS MATERIALIZED (
    SELECT o.id, o.contact_id, o.status, o.created_at, COALESCE(o.won_at, o.lost_at) AS closed_at, s.total_messages_inbound
    FROM opportunities o
    LEFT JOIN opportunity_behavior_snapshot s ON s.opportunity_id = o.id
    WHERE o.organization_id = p_org AND o.deleted_at IS NULL AND o.status IN ('won', 'lost')
      AND COALESCE(o.won_at, o.lost_at) >= v_since AND o.contact_id IS NOT NULL
  ),
  closed_events AS MATERIALIZED (
    SELECT c.id AS deal_id, e.event_type,
           CASE WHEN e.payload->>'type' = ANY(v_known) THEN e.payload->>'type' ELSE 'other' END AS objection
    FROM closed c
    JOIN sales_events e ON e.organization_id = p_org AND e.contact_id = c.contact_id
      AND e.event_type IN ('objection_detected', 'buying_signal_detected')
      AND e.occurred_at >= c.created_at AND e.occurred_at <= c.closed_at
    JOIN messages m ON m.id = e.message_id AND m.direction = 'inbound'
  ),
  per_deal AS (
    SELECT c.status, c.total_messages_inbound,
           EXTRACT(EPOCH FROM (c.closed_at - c.created_at)) / 86400 AS days_to_close,
           count(e.deal_id) FILTER (WHERE e.event_type = 'objection_detected') AS objections,
           count(e.deal_id) FILTER (WHERE e.event_type = 'buying_signal_detected') AS signals
    FROM closed c LEFT JOIN closed_events e ON e.deal_id = c.id
    GROUP BY c.id, c.status, c.total_messages_inbound, c.closed_at, c.created_at
  ),
  objection_outcome AS (
    SELECT e.objection, count(DISTINCT c.id) AS closed_deals,
           count(DISTINCT c.id) FILTER (WHERE c.status = 'won') AS won_deals
    FROM closed_events e JOIN closed c ON c.id = e.deal_id
    WHERE e.event_type = 'objection_detected'
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'totals', (SELECT jsonb_build_object(
        'analyzed', count(*),
        'objections', count(*) FILTER (WHERE objection IS NOT NULL),
        'signals', count(*) FILTER (WHERE has_signal),
        'negative', count(*) FILTER (WHERE sentiment IN ('negative', 'very_negative'))
      ) FROM analyses),
    'objections', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', x.objection, 'count', x.n,
        'closed_deals', COALESCE(oo.closed_deals, 0), 'won_deals', COALESCE(oo.won_deals, 0)) ORDER BY x.n DESC)
      FROM (SELECT objection, count(*) n FROM analyses WHERE objection IS NOT NULL GROUP BY 1) x
      LEFT JOIN objection_outcome oo ON oo.objection = x.objection), '[]'::jsonb),
    'stages', COALESCE((SELECT jsonb_agg(jsonb_build_object('stage', y.conversation_stage, 'messages', y.n, 'signals', y.s))
      FROM (SELECT conversation_stage, count(*) n, count(*) FILTER (WHERE has_signal) s
            FROM analyses WHERE conversation_stage IS NOT NULL GROUP BY 1) y), '[]'::jsonb),
    'outcomes', COALESCE((SELECT jsonb_object_agg(z.status, jsonb_build_object(
        'deals', z.deals, 'with_objection', z.wo, 'with_signal', z.ws, 'messages', z.messages, 'days_to_close', z.d))
      FROM (SELECT status, count(*) deals, count(*) FILTER (WHERE objections > 0) wo, count(*) FILTER (WHERE signals > 0) ws,
                   round(avg(total_messages_inbound), 1) messages, round(avg(days_to_close)::numeric, 1) d
            FROM per_deal GROUP BY 1) z), '{}'::jsonb),
    'reprocessing', (SELECT count(*) FROM intelligence_jobs j
      WHERE j.organization_id = p_org AND j.status IN ('pending', 'running') AND j.idempotency_key LIKE 'reanalyze:%')
  ) INTO v_result;

  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.rpc_intelligence_insights(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_intelligence_insights(uuid, integer) TO authenticated, service_role;
