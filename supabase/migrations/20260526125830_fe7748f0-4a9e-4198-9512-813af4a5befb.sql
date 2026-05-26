
-- Backfill runs tracking table
CREATE TABLE IF NOT EXISTS public.intelligence_backfill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_ts timestamptz NOT NULL,
  to_ts timestamptz NOT NULL,
  slice_hours integer NOT NULL DEFAULT 6,
  max_cost_usd numeric NOT NULL DEFAULT 5,
  cursor_ts timestamptz NOT NULL,
  enqueued_text integer NOT NULL DEFAULT 0,
  enqueued_audio integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','paused_manual','paused_budget','paused_rate_limit','done','error')),
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backfill_runs_org ON public.intelligence_backfill_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backfill_runs_status ON public.intelligence_backfill_runs(status) WHERE status = 'running';

ALTER TABLE public.intelligence_backfill_runs ENABLE ROW LEVEL SECURITY;

-- Admin only via service role; no client policies (worker token controls access)
CREATE POLICY "service_role_full_access_backfill_runs" ON public.intelligence_backfill_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- View: won vs lost per opportunity (last 30d, closed)
CREATE OR REPLACE VIEW public.vw_intel_won_vs_lost_30d AS
SELECT
  o.organization_id,
  o.id AS opportunity_id,
  o.owner_user_id,
  o.status,
  o.created_at AS opp_created_at,
  COALESCE(s.won_at, s.lost_at) AS closed_at,
  EXTRACT(EPOCH FROM (COALESCE(s.won_at, s.lost_at) - o.created_at)) / 3600.0 AS cycle_hours,
  s.total_messages_inbound,
  s.total_messages_outbound,
  s.audios_inbound,
  s.audios_outbound,
  s.first_response_seconds,
  s.avg_lead_response_seconds,
  s.avg_seller_response_seconds,
  s.objections_count,
  s.buying_signals_count,
  s.days_to_close,
  (SELECT AVG(ma.urgency_score)
     FROM public.message_analyses ma
     JOIN public.messages m ON m.id = ma.message_id
     JOIN public.message_threads mt ON mt.id = m.thread_id
    WHERE mt.opportunity_id = o.id
      AND ma.urgency_score IS NOT NULL) AS avg_urgency_score,
  (SELECT mode() WITHIN GROUP (ORDER BY ma.sentiment)
     FROM public.message_analyses ma
     JOIN public.messages m ON m.id = ma.message_id
     JOIN public.message_threads mt ON mt.id = m.thread_id
    WHERE mt.opportunity_id = o.id
      AND ma.sentiment IS NOT NULL) AS dominant_sentiment,
  (SELECT COUNT(*) FROM public.sales_events se
    WHERE se.opportunity_id = o.id AND se.event_type = 'human_handoff_suggested') AS human_handoff_count,
  (SELECT COUNT(*) FROM public.sales_events se
    WHERE se.opportunity_id = o.id AND se.event_type = 'negative_sentiment_detected') AS negative_sentiment_count
FROM public.opportunities o
LEFT JOIN public.opportunity_behavior_snapshot s ON s.opportunity_id = o.id
WHERE o.status IN ('won','lost')
  AND o.updated_at > now() - interval '30 days'
  AND o.deleted_at IS NULL;

-- View: per-seller aggregate over last 30d
CREATE OR REPLACE VIEW public.vw_intel_sellers_30d AS
WITH closed AS (
  SELECT
    o.organization_id,
    o.owner_user_id,
    COUNT(*) FILTER (WHERE o.status='won') AS deals_won,
    COUNT(*) FILTER (WHERE o.status='lost') AS deals_lost,
    COUNT(*) AS deals_closed,
    AVG(EXTRACT(EPOCH FROM (COALESCE(s.won_at, s.lost_at) - o.created_at)) / 3600.0) AS avg_cycle_hours,
    AVG(s.first_response_seconds) FILTER (WHERE s.first_response_seconds IS NOT NULL) AS avg_first_response_seconds,
    AVG(s.total_messages_outbound) AS avg_msgs_outbound_per_deal,
    AVG(s.audios_outbound) AS avg_audios_outbound_per_deal,
    AVG(s.objections_count) AS avg_objections_per_deal,
    AVG(s.buying_signals_count) AS avg_buying_signals_per_deal
  FROM public.opportunities o
  LEFT JOIN public.opportunity_behavior_snapshot s ON s.opportunity_id = o.id
  WHERE o.status IN ('won','lost')
    AND o.updated_at > now() - interval '30 days'
    AND o.deleted_at IS NULL
    AND o.owner_user_id IS NOT NULL
  GROUP BY o.organization_id, o.owner_user_id
)
SELECT
  c.*,
  CASE WHEN deals_closed > 0 THEN deals_won::numeric / deals_closed ELSE 0 END AS win_rate
FROM closed c;

-- Trigger to keep updated_at fresh
CREATE TRIGGER trg_backfill_runs_updated_at
BEFORE UPDATE ON public.intelligence_backfill_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
