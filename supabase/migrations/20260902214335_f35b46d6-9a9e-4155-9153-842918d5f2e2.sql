-- Core: aggregation only, NO permission checks. Never granted to authenticated/anon.
CREATE OR REPLACE FUNCTION public.get_home_dashboard_stats_core(
  p_organization_id uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_from_day        date,
  p_to_day          date,
  p_owner_user_id   uuid,
  p_view_all        boolean,
  p_self_user_id    uuid,
  p_tz              text
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
WITH bounds AS (
  SELECT
    (p_from - interval '1 millisecond')                                                  AS prev_to,
    (p_from - interval '1 millisecond') - (p_to - p_from)                                 AS prev_from,
    (((p_from - interval '1 millisecond')) AT TIME ZONE p_tz)::date                       AS prev_to_day,
    ((((p_from - interval '1 millisecond') - (p_to - p_from))) AT TIME ZONE p_tz)::date    AS prev_from_day
),
effective_owner AS (
  SELECT CASE
           WHEN p_view_all IS NOT TRUE THEN p_self_user_id
           ELSE p_owner_user_id
         END AS owner_id
),
scope AS (
  SELECT o.id, o.status, o.created_at, o.close_date
  FROM opportunities o, effective_owner eo
  WHERE o.organization_id = p_organization_id
    AND o.deleted_at IS NULL
    AND (eo.owner_id IS NULL OR o.owner_user_id = eo.owner_id)
),
created_cur AS (
  SELECT * FROM scope WHERE created_at >= p_from AND created_at <= p_to
),
won_cur AS (
  SELECT * FROM scope
  WHERE status = 'won' AND close_date IS NOT NULL
    AND close_date >= p_from_day AND close_date <= p_to_day
),
created_prev AS (
  SELECT count(*)::bigint AS c
  FROM scope s, bounds b
  WHERE s.created_at >= b.prev_from AND s.created_at <= b.prev_to
),
won_prev AS (
  SELECT count(*)::bigint AS c
  FROM scope s, bounds b
  WHERE s.status = 'won' AND s.close_date IS NOT NULL
    AND s.close_date >= b.prev_from_day AND s.close_date <= b.prev_to_day
),
status_cur AS (
  SELECT
    count(*) FILTER (WHERE status NOT IN ('won','lost'))::bigint AS open_c,
    count(*) FILTER (WHERE status = 'won')::bigint               AS won_c,
    count(*) FILTER (WHERE status = 'lost')::bigint              AS lost_c
  FROM created_cur
),
days AS (
  SELECT generate_series(p_from_day, p_to_day, interval '1 day')::date AS d
),
created_by_day AS (
  SELECT ((created_at AT TIME ZONE p_tz)::date) AS d, count(*)::bigint AS n
  FROM created_cur GROUP BY 1
),
won_by_day AS (
  SELECT close_date AS d, count(*)::bigint AS n
  FROM won_cur GROUP BY 1
),
trend AS (
  SELECT d.d AS bucket_date,
         COALESCE(c.n, 0) AS created,
         COALESCE(w.n, 0) AS won
  FROM days d
  LEFT JOIN created_by_day c ON c.d = d.d
  LEFT JOIN won_by_day     w ON w.d = d.d
  ORDER BY d.d
)
SELECT json_build_object(
  'kpis', json_build_object(
    'created_count',      (SELECT count(*)::bigint FROM created_cur),
    'created_count_prev', (SELECT c FROM created_prev),
    'won_count',          (SELECT count(*)::bigint FROM won_cur),
    'won_count_prev',     (SELECT c FROM won_prev)
  ),
  'status', (SELECT json_build_object('open', open_c, 'won', won_c, 'lost', lost_c) FROM status_cur),
  'trend', COALESCE((
    SELECT json_agg(json_build_object('bucket_date', bucket_date, 'created', created, 'won', won))
    FROM trend
  ), '[]'::json)
);
$function$;

REVOKE ALL ON FUNCTION public.get_home_dashboard_stats_core(uuid, timestamptz, timestamptz, date, date, uuid, boolean, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_home_dashboard_stats_core(uuid, timestamptz, timestamptz, date, date, uuid, boolean, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_home_dashboard_stats_core(uuid, timestamptz, timestamptz, date, date, uuid, boolean, uuid, text) FROM authenticated;

-- Public wrapper: identity + membership + canonical view_all_opportunities, each resolved ONCE.
CREATE OR REPLACE FUNCTION public.get_home_dashboard_stats(
  p_organization_id uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_from_day        date,
  p_to_day          date,
  p_owner_user_id   uuid DEFAULT NULL,
  p_tz              text DEFAULT 'America/Sao_Paulo'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id  uuid;
  v_is_admin boolean;
  v_result   json;
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

  -- 3. isAdmin resolved ONCE — same criterion the screen uses today
  --    (view_all_opportunities in the org permission profile).
  --    Deliberately NOT user_can_view_all(): that returns true for everyone
  --    when organizations.private_records_enabled is not true.
  SELECT COALESCE((pp.permissions ->> 'view_all_opportunities')::boolean, false)
  INTO v_is_admin
  FROM user_organizations uo
  JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
  WHERE uo.user_id = v_user_id
    AND uo.organization_id = p_organization_id
    AND uo.is_active = true
  LIMIT 1;

  v_is_admin := COALESCE(v_is_admin, false);

  -- 4/5. Admin honours p_owner_user_id; non-admin is forced to self.
  SELECT public.get_home_dashboard_stats_core(
           p_organization_id,
           p_from,
           p_to,
           p_from_day,
           p_to_day,
           CASE WHEN v_is_admin THEN p_owner_user_id ELSE NULL END,
           v_is_admin,
           v_user_id,
           COALESCE(NULLIF(p_tz, ''), 'America/Sao_Paulo')
         )
  INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_home_dashboard_stats(uuid, timestamptz, timestamptz, date, date, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_home_dashboard_stats(uuid, timestamptz, timestamptz, date, date, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_home_dashboard_stats(uuid, timestamptz, timestamptz, date, date, uuid, text) TO authenticated;