CREATE OR REPLACE FUNCTION public.get_opportunities_by_stage(
  p_organization_id uuid,
  p_limit_per_stage integer DEFAULT 50,
  p_owner_ids uuid[] DEFAULT NULL,
  p_include_no_owner boolean DEFAULT false,
  p_min_amount numeric DEFAULT NULL,
  p_max_amount numeric DEFAULT NULL,
  p_close_date_from date DEFAULT NULL,
  p_close_date_to date DEFAULT NULL,
  p_no_close_date boolean DEFAULT false,
  p_created_from date DEFAULT NULL,
  p_created_to date DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL,
  p_stage_ids uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
  v_user_id uuid;
  v_can_view_all boolean;
  v_owner_filter_active boolean;
  v_tag_filter_active boolean;
  v_stage_filter_active boolean;
BEGIN
  v_user_id := current_user_id();

  IF NOT EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.organization_id = p_organization_id
      AND uo.user_id = v_user_id
      AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  v_can_view_all := user_can_view_all(p_organization_id, 'opportunities');
  v_owner_filter_active := COALESCE(array_length(p_owner_ids, 1), 0) > 0 OR p_include_no_owner;
  v_tag_filter_active   := COALESCE(array_length(p_tag_ids, 1), 0) > 0;
  v_stage_filter_active := COALESCE(array_length(p_stage_ids, 1), 0) > 0;

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
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::bigint as opportunity_count,
        COALESCE(SUM(o.amount), 0) as total_amount
      FROM opportunities o
      WHERE o.pipeline_stage_id = ps.id
        AND o.organization_id = p_organization_id
        AND o.deleted_at IS NULL
        AND o.status::text = (
          CASE ps.type WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE 'open' END
        )
        AND (v_can_view_all OR o.owner_user_id = v_user_id)
        AND (
          NOT v_owner_filter_active
          OR (p_owner_ids IS NOT NULL AND o.owner_user_id = ANY(p_owner_ids))
          OR (p_include_no_owner AND o.owner_user_id IS NULL)
        )
        AND (p_min_amount IS NULL OR o.amount >= p_min_amount)
        AND (p_max_amount IS NULL OR o.amount <= p_max_amount)
        AND (
          CASE
            WHEN p_no_close_date THEN o.close_date IS NULL
            ELSE
              (p_close_date_from IS NULL OR o.close_date >= p_close_date_from)
              AND (p_close_date_to IS NULL OR o.close_date <= p_close_date_to)
          END
        )
        AND (p_created_from IS NULL OR o.created_at::date >= p_created_from)
        AND (p_created_to   IS NULL OR o.created_at::date <= p_created_to)
        AND (NOT v_stage_filter_active OR o.pipeline_stage_id = ANY(p_stage_ids))
        AND (
          NOT v_tag_filter_active
          OR EXISTS (
            SELECT 1 FROM tag_assignments ta
            WHERE ta.entity_type = 'opportunity'
              AND ta.entity_id = o.id
              AND ta.organization_id = p_organization_id
              AND ta.tag_id = ANY(p_tag_ids)
          )
        )
    ) counts ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(row_to_json(opp_row)) as items
      FROM (
        SELECT
          o.id, o.title, o.amount, o.currency,
          o.pipeline_stage_id, o.contact_id, o.close_date,
          o.created_at,
          o.owner_user_id,
          json_build_object('full_name', c.full_name) as contacts,
          json_build_object('full_name', u.full_name) as users
        FROM opportunities o
        LEFT JOIN contacts c ON c.id = o.contact_id
        LEFT JOIN users u    ON u.id = o.owner_user_id
        WHERE o.pipeline_stage_id = ps.id
          AND o.organization_id = p_organization_id
          AND o.deleted_at IS NULL
          AND o.status::text = (
            CASE ps.type WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE 'open' END
          )
          AND (v_can_view_all OR o.owner_user_id = v_user_id)
          AND (
            NOT v_owner_filter_active
            OR (p_owner_ids IS NOT NULL AND o.owner_user_id = ANY(p_owner_ids))
            OR (p_include_no_owner AND o.owner_user_id IS NULL)
          )
          AND (p_min_amount IS NULL OR o.amount >= p_min_amount)
          AND (p_max_amount IS NULL OR o.amount <= p_max_amount)
          AND (
            CASE
              WHEN p_no_close_date THEN o.close_date IS NULL
              ELSE
                (p_close_date_from IS NULL OR o.close_date >= p_close_date_from)
                AND (p_close_date_to IS NULL OR o.close_date <= p_close_date_to)
            END
          )
          AND (p_created_from IS NULL OR o.created_at::date >= p_created_from)
          AND (p_created_to   IS NULL OR o.created_at::date <= p_created_to)
          AND (NOT v_stage_filter_active OR o.pipeline_stage_id = ANY(p_stage_ids))
          AND (
            NOT v_tag_filter_active
            OR EXISTS (
              SELECT 1 FROM tag_assignments ta
              WHERE ta.entity_type = 'opportunity'
                AND ta.entity_id = o.id
                AND ta.organization_id = p_organization_id
                AND ta.tag_id = ANY(p_tag_ids)
            )
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
$function$;