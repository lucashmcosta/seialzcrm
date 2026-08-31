-- Core aggregator: NO permission checks, NOT granted to app roles.
CREATE OR REPLACE FUNCTION public.get_sales_dashboard_stats_core(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_from_day date,
  p_to_day date,
  p_owner_user_id uuid DEFAULT NULL,
  p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH bounds AS (
  SELECT
    GREATEST(1, round(EXTRACT(epoch FROM (p_to - p_from)) / 86400.0))::int AS days
),
b AS (
  SELECT
    days,
    p_from - make_interval(days => days) AS prev_from,
    p_from AS prev_to,
    (p_from_day - days) AS prev_from_day,
    p_from_day AS prev_to_day
  FROM bounds
),
scope AS (
  SELECT o.id, o.amount, o.status, o.pipeline_stage_id, o.owner_user_id,
         o.created_at, o.close_date
  FROM opportunities o
  WHERE o.organization_id = p_organization_id
    AND o.deleted_at IS NULL
    AND (p_owner_user_id IS NULL OR o.owner_user_id = p_owner_user_id)
),
created AS (
  SELECT s.* FROM scope s
  WHERE s.created_at >= p_from AND s.created_at <= p_to
),
closed AS (
  SELECT s.* FROM scope s
  WHERE s.status IN ('won', 'lost')
    AND s.close_date IS NOT NULL
    AND s.close_date >= p_from_day AND s.close_date <= p_to_day
),
prev_created AS (
  SELECT s.* FROM scope s, b
  WHERE s.created_at >= b.prev_from AND s.created_at < b.prev_to
),
prev_closed AS (
  SELECT s.* FROM scope s, b
  WHERE s.status IN ('won', 'lost')
    AND s.close_date IS NOT NULL
    AND s.close_date >= b.prev_from_day AND s.close_date < b.prev_to_day
),
open_opps AS (
  SELECT s.* FROM scope s WHERE s.status = 'open'
),
agg AS (
  SELECT
    (SELECT count(*) FROM created) AS created_count,
    (SELECT count(*) FROM prev_created) AS created_count_prev,
    (SELECT count(*) FROM closed WHERE status = 'won') AS won_count,
    (SELECT COALESCE(sum(COALESCE(amount, 0)), 0) FROM closed WHERE status = 'won') AS won_value,
    (SELECT COALESCE(sum(COALESCE(amount, 0)), 0) FROM prev_closed WHERE status = 'won') AS won_value_prev,
    (SELECT count(*) FROM prev_closed WHERE status = 'won') AS won_count_prev,
    (SELECT count(*) FROM closed WHERE status = 'lost') AS lost_count,
    (SELECT COALESCE(sum(COALESCE(amount, 0)), 0) FROM closed WHERE status = 'lost') AS lost_value,
    (SELECT count(*) FROM open_opps) AS open_count,
    (SELECT COALESCE(sum(COALESCE(amount, 0)), 0) FROM open_opps) AS open_value,
    (SELECT COALESCE(avg(GREATEST(0,
        EXTRACT(epoch FROM ((c.close_date::timestamp AT TIME ZONE p_tz) - c.created_at)) / 86400.0)), 0)
     FROM closed c WHERE c.status = 'won') AS avg_cycle_days
),
funnel AS (
  SELECT json_agg(f ORDER BY f.order_index) AS data
  FROM (
    SELECT ps.id AS stage_id, ps.name, ps.order_index,
           count(o.id) AS count,
           COALESCE(sum(COALESCE(o.amount, 0)), 0) AS value
    FROM pipeline_stages ps
    LEFT JOIN open_opps o ON o.pipeline_stage_id = ps.id
    WHERE ps.organization_id = p_organization_id
      AND ps.type = 'custom'
    GROUP BY ps.id, ps.name, ps.order_index
  ) f
),
trend_created AS (
  SELECT (created_at AT TIME ZONE p_tz)::date AS d, count(*) AS created
  FROM created GROUP BY 1
),
trend_won AS (
  SELECT close_date AS d, count(*) AS won,
         COALESCE(sum(COALESCE(amount, 0)), 0) AS won_value
  FROM closed WHERE status = 'won' GROUP BY 1
),
trend AS (
  SELECT json_agg(t ORDER BY t.bucket_date) AS data
  FROM (
    SELECT COALESCE(tc.d, tw.d) AS bucket_date,
           COALESCE(tc.created, 0) AS created,
           COALESCE(tw.won, 0) AS won,
           COALESCE(tw.won_value, 0) AS won_value
    FROM trend_created tc
    FULL OUTER JOIN trend_won tw ON tw.d = tc.d
  ) t
),
lb_keys AS (
  SELECT COALESCE(owner_user_id::text, 'unassigned') AS k, owner_user_id FROM open_opps
  UNION
  SELECT COALESCE(owner_user_id::text, 'unassigned'), owner_user_id FROM created
  UNION
  SELECT COALESCE(owner_user_id::text, 'unassigned'), owner_user_id FROM closed
),
leaderboard AS (
  SELECT json_agg(l) AS data
  FROM (
    SELECT
      k.k AS user_id,
      COALESCE(u.full_name, 'Sem responsável') AS full_name,
      (SELECT count(*) FROM open_opps o WHERE COALESCE(o.owner_user_id::text, 'unassigned') = k.k) AS open,
      (SELECT count(*) FROM created c WHERE COALESCE(c.owner_user_id::text, 'unassigned') = k.k) AS created,
      (SELECT count(*) FROM closed c WHERE c.status = 'won' AND COALESCE(c.owner_user_id::text, 'unassigned') = k.k) AS won,
      (SELECT count(*) FROM closed c WHERE c.status = 'lost' AND COALESCE(c.owner_user_id::text, 'unassigned') = k.k) AS lost,
      (SELECT COALESCE(sum(COALESCE(c.amount, 0)), 0) FROM closed c WHERE c.status = 'won' AND COALESCE(c.owner_user_id::text, 'unassigned') = k.k) AS won_value
    FROM lb_keys k
    LEFT JOIN users u ON u.id = k.owner_user_id
  ) l
  WHERE l.open > 0 OR l.created > 0 OR l.won > 0 OR l.lost > 0
)
SELECT json_build_object(
  'range', json_build_object(
    'from', p_from, 'to', p_to, 'from_day', p_from_day, 'to_day', p_to_day,
    'days', (SELECT days FROM b), 'tz', p_tz
  ),
  'kpis', json_build_object(
    'created_count', a.created_count,
    'created_count_prev', a.created_count_prev,
    'won_count', a.won_count,
    'won_value', a.won_value,
    'won_value_prev', a.won_value_prev,
    'won_count_prev', a.won_count_prev,
    'lost_count', a.lost_count,
    'lost_value', a.lost_value,
    'open_count', a.open_count,
    'open_value', a.open_value,
    'win_rate', CASE WHEN a.created_count > 0 THEN (a.won_count::numeric / a.created_count) * 100 ELSE 0 END,
    'win_rate_prev', CASE WHEN a.created_count_prev > 0 THEN (a.won_count_prev::numeric / a.created_count_prev) * 100 ELSE 0 END,
    'avg_ticket', CASE WHEN a.won_count > 0 THEN a.won_value / a.won_count ELSE 0 END,
    'avg_cycle_days', a.avg_cycle_days
  ),
  'funnel', COALESCE((SELECT data FROM funnel), '[]'::json),
  'trend', COALESCE((SELECT data FROM trend), '[]'::json),
  'leaderboard', COALESCE((SELECT data FROM leaderboard), '[]'::json)
)
FROM agg a;
$function$;

REVOKE ALL ON FUNCTION public.get_sales_dashboard_stats_core(uuid, timestamptz, timestamptz, date, date, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sales_dashboard_stats_core(uuid, timestamptz, timestamptz, date, date, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_sales_dashboard_stats_core(uuid, timestamptz, timestamptz, date, date, uuid, text) FROM authenticated;

-- Public wrapper: identity + active membership + canonical admin gate, resolved exactly ONCE.
CREATE OR REPLACE FUNCTION public.get_sales_dashboard_stats(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_from_day date,
  p_to_day date,
  p_owner_user_id uuid DEFAULT NULL,
  p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_result json;
BEGIN
  -- 1. identity
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  -- 2. active membership in the organization
  IF NOT EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.organization_id = p_organization_id
      AND uo.user_id = v_user_id
      AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  -- 3. canonical administrative permission (same gate that exposes /dashboards)
  IF NOT public.can_manage_permission_profiles(p_organization_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  -- 4. delegate aggregation
  SELECT public.get_sales_dashboard_stats_core(
           p_organization_id, p_from, p_to, p_from_day, p_to_day, p_owner_user_id, p_tz
         )
  INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sales_dashboard_stats(uuid, timestamptz, timestamptz, date, date, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sales_dashboard_stats(uuid, timestamptz, timestamptz, date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_dashboard_stats(uuid, timestamptz, timestamptz, date, date, uuid, text) TO service_role;