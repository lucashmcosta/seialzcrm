-- ============================================================================
-- Migration: Create consolidated RPCs for Dashboard and Kanban
--
-- 1. get_dashboard_stats: Replaces 8+ separate queries with single RPC
-- 2. get_opportunities_by_stage: Replaces N+1 per-stage queries with single RPC
-- ============================================================================

-- =====================
-- 1. get_dashboard_stats
-- =====================
-- Consolidates: open opps count/sum, won opps sum + details, lost count,
--               new contacts count, stage chart data, tasks, activities
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_organization_id uuid,
  p_days_ago integer DEFAULT 30,
  p_owner_user_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_date_filter timestamptz;
  v_result json;
  v_open_count bigint;
  v_pipeline_value numeric;
  v_won_amount numeric;
  v_lost_count bigint;
  v_new_contacts bigint;
  v_stage_data json;
  v_won_trend json;
  v_tasks json;
  v_activities json;
BEGIN
  -- Access check
  IF NOT EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.organization_id = p_organization_id
      AND uo.user_id = current_user_id()
      AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  v_date_filter := now() - (p_days_ago || ' days')::interval;

  -- KPI: Open opportunities count + pipeline value
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_open_count, v_pipeline_value
  FROM opportunities
  WHERE organization_id = p_organization_id
    AND status = 'open'
    AND deleted_at IS NULL
    AND (p_owner_user_id IS NULL OR owner_user_id = p_owner_user_id);

  -- KPI: Won amount in period
  SELECT COALESCE(SUM(amount), 0)
  INTO v_won_amount
  FROM opportunities
  WHERE organization_id = p_organization_id
    AND status = 'won'
    AND updated_at >= v_date_filter
    AND deleted_at IS NULL
    AND (p_owner_user_id IS NULL OR owner_user_id = p_owner_user_id);

  -- KPI: Lost count in period
  SELECT COUNT(*)
  INTO v_lost_count
  FROM opportunities
  WHERE organization_id = p_organization_id
    AND status = 'lost'
    AND updated_at >= v_date_filter
    AND deleted_at IS NULL
    AND (p_owner_user_id IS NULL OR owner_user_id = p_owner_user_id);

  -- KPI: New contacts in period
  SELECT COUNT(*)
  INTO v_new_contacts
  FROM contacts
  WHERE organization_id = p_organization_id
    AND created_at >= v_date_filter
    AND deleted_at IS NULL
    AND (p_owner_user_id IS NULL OR owner_user_id = p_owner_user_id);

  -- Chart: Opportunities by stage (custom stages only)
  SELECT json_agg(row_to_json(s))
  INTO v_stage_data
  FROM (
    SELECT
      ps.name,
      COALESCE(SUM(o.amount), 0) as value
    FROM pipeline_stages ps
    LEFT JOIN opportunities o
      ON o.pipeline_stage_id = ps.id
      AND o.organization_id = p_organization_id
      AND o.status = 'open'
      AND o.deleted_at IS NULL
      AND (p_owner_user_id IS NULL OR o.owner_user_id = p_owner_user_id)
    WHERE ps.organization_id = p_organization_id
      AND ps.type = 'custom'
    GROUP BY ps.id, ps.name, ps.order_index
    ORDER BY ps.order_index
  ) s;

  -- Chart: Won trend (amount grouped by date)
  SELECT json_agg(row_to_json(w))
  INTO v_won_trend
  FROM (
    SELECT
      updated_at::date as date,
      SUM(amount) as amount
    FROM opportunities
    WHERE organization_id = p_organization_id
      AND status = 'won'
      AND updated_at >= v_date_filter
      AND deleted_at IS NULL
      AND (p_owner_user_id IS NULL OR owner_user_id = p_owner_user_id)
    GROUP BY updated_at::date
    ORDER BY updated_at::date
  ) w;

  -- Tasks: My open tasks due today or overdue (for current user)
  SELECT json_agg(row_to_json(tk))
  INTO v_tasks
  FROM (
    SELECT
      t.id, t.title, t.due_at, t.priority, t.contact_id,
      json_build_object('full_name', c.full_name) as contacts
    FROM tasks t
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.organization_id = p_organization_id
      AND t.assigned_user_id = current_user_id()
      AND t.status = 'open'
      AND t.due_at <= (now()::date + interval '1 day' - interval '1 second')
      AND t.deleted_at IS NULL
    ORDER BY t.due_at ASC
    LIMIT 5
  ) tk;

  -- Activities: Recent 10
  SELECT json_agg(row_to_json(ac))
  INTO v_activities
  FROM (
    SELECT
      a.id, a.title, a.activity_type, a.occurred_at, a.contact_id,
      json_build_object('full_name', c.full_name) as contacts
    FROM activities a
    LEFT JOIN contacts c ON c.id = a.contact_id
    WHERE a.organization_id = p_organization_id
      AND a.deleted_at IS NULL
    ORDER BY a.occurred_at DESC
    LIMIT 10
  ) ac;

  -- Build final result
  v_result := json_build_object(
    'open_count', v_open_count,
    'pipeline_value', v_pipeline_value,
    'won_amount', v_won_amount,
    'lost_count', v_lost_count,
    'new_contacts', v_new_contacts,
    'stage_data', COALESCE(v_stage_data, '[]'::json),
    'won_trend', COALESCE(v_won_trend, '[]'::json),
    'tasks', COALESCE(v_tasks, '[]'::json),
    'activities', COALESCE(v_activities, '[]'::json)
  );

  RETURN v_result;
END;
$$;

-- =====================
-- 2. get_opportunities_by_stage
-- =====================
-- Returns first batch of opportunities for ALL stages in a single query,
-- eliminating the N+1 pattern of querying per stage.
CREATE OR REPLACE FUNCTION get_opportunities_by_stage(
  p_organization_id uuid,
  p_limit_per_stage integer DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_result json;
BEGIN
  -- Access check
  IF NOT EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.organization_id = p_organization_id
      AND uo.user_id = current_user_id()
      AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  SELECT json_agg(row_to_json(stage_row))
  INTO v_result
  FROM (
    SELECT
      ps.id as stage_id,
      ps.name as stage_name,
      ps.order_index,
      ps.type as stage_type,
      COALESCE(counts.opportunity_count, 0) as total_count,
      COALESCE(counts.total_amount, 0) as total_amount,
      COALESCE(opps.items, '[]'::json) as opportunities
    FROM pipeline_stages ps
    -- Counts (unlimited)
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::bigint as opportunity_count,
        COALESCE(SUM(o.amount), 0) as total_amount
      FROM opportunities o
      WHERE o.pipeline_stage_id = ps.id
        AND o.organization_id = p_organization_id
        AND o.deleted_at IS NULL
        AND o.status::text = (
          CASE ps.type
            WHEN 'won' THEN 'won'
            WHEN 'lost' THEN 'lost'
            ELSE 'open'
          END
        )
    ) counts ON true
    -- First batch of opportunities (limited)
    LEFT JOIN LATERAL (
      SELECT json_agg(row_to_json(opp_row)) as items
      FROM (
        SELECT
          o.id, o.title, o.amount, o.currency,
          o.pipeline_stage_id, o.contact_id, o.close_date,
          o.owner_user_id,
          json_build_object('full_name', c.full_name) as contacts,
          json_build_object('full_name', u.full_name) as users
        FROM opportunities o
        LEFT JOIN contacts c ON c.id = o.contact_id
        LEFT JOIN users u ON u.id = o.owner_user_id
        WHERE o.pipeline_stage_id = ps.id
          AND o.organization_id = p_organization_id
          AND o.deleted_at IS NULL
          AND o.status::text = (
            CASE ps.type
              WHEN 'won' THEN 'won'
              WHEN 'lost' THEN 'lost'
              ELSE 'open'
            END
          )
        ORDER BY o.created_at DESC
        LIMIT p_limit_per_stage
      ) opp_row
    ) opps ON true
    WHERE ps.organization_id = p_organization_id
    ORDER BY ps.order_index
  ) stage_row;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;
