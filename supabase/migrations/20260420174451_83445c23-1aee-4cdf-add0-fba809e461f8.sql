
-- Fix privacy bypass: get_opportunities_by_stage now respects private_records_enabled
CREATE OR REPLACE FUNCTION public.get_opportunities_by_stage(p_organization_id uuid, p_limit_per_stage integer DEFAULT 50)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
  v_user_id uuid;
  v_can_view_all boolean;
BEGIN
  v_user_id := current_user_id();

  -- Access check
  IF NOT EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.organization_id = p_organization_id
      AND uo.user_id = v_user_id
      AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  -- Privacy check: does this user see all opportunities or only their own?
  v_can_view_all := user_can_view_all(p_organization_id, 'opportunities');

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
    ) counts ON true
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
            CASE ps.type WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE 'open' END
          )
          AND (v_can_view_all OR o.owner_user_id = v_user_id)
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

-- Same fix for stage counts
CREATE OR REPLACE FUNCTION public.get_opportunity_stage_counts(org_id uuid)
 RETURNS TABLE(stage_id uuid, opportunity_count bigint, total_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_can_view_all boolean;
BEGIN
  v_user_id := current_user_id();
  v_can_view_all := user_can_view_all(org_id, 'opportunities');

  RETURN QUERY
  SELECT
    ps.id as stage_id,
    COUNT(o.id)::BIGINT as opportunity_count,
    COALESCE(SUM(o.amount), 0) as total_amount
  FROM pipeline_stages ps
  LEFT JOIN opportunities o
    ON o.pipeline_stage_id = ps.id
    AND o.organization_id = org_id
    AND o.deleted_at IS NULL
    AND o.status::text = (
      CASE ps.type WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE 'open' END
    )
    AND (v_can_view_all OR o.owner_user_id = v_user_id)
  WHERE ps.organization_id = org_id
  GROUP BY ps.id;
END;
$function$;

-- Fix privacy bypass: rpc_list_message_threads now respects private_records_enabled
CREATE OR REPLACE FUNCTION public.rpc_list_message_threads(
  p_organization_id uuid,
  p_status text DEFAULT NULL,
  p_channels text[] DEFAULT NULL,
  p_assigned_user_id uuid DEFAULT NULL,
  p_unassigned_only boolean DEFAULT false,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
 RETURNS TABLE(
   id uuid, contact_id uuid, contact_name text, contact_phone text,
   channel text, subject text, status text,
   last_message_id uuid, last_message_content text, last_message_direction text,
   last_message_at timestamptz, last_inbound_at timestamptz,
   whatsapp_last_inbound_at timestamptz,
   needs_human_attention boolean, agent_typing boolean, awaiting_button_response boolean,
   assigned_user_id uuid, assigned_user_name text,
   updated_at timestamptz, created_at timestamptz, is_unread boolean
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_can_view_all_threads boolean;
  v_can_view_all_contacts boolean;
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

  v_can_view_all_threads := user_can_view_all(p_organization_id, 'threads');
  v_can_view_all_contacts := user_can_view_all(p_organization_id, 'contacts');

  RETURN QUERY
  SELECT
    mt.id,
    mt.contact_id,
    c.full_name,
    c.phone,
    mt.channel,
    mt.subject,
    mt.status,
    mt.last_message_id,
    mt.last_message_content,
    mt.last_message_direction,
    mt.last_message_at,
    mt.last_inbound_at,
    mt.whatsapp_last_inbound_at,
    mt.needs_human_attention,
    mt.agent_typing,
    mt.awaiting_button_response,
    mt.assigned_user_id,
    u.full_name,
    mt.updated_at,
    mt.created_at,
    CASE
      WHEN mt.last_message_direction = 'inbound'
        AND COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) IS NOT NULL
        AND (
          mtr.last_read_at IS NULL
          OR COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) > mtr.last_read_at
        )
      THEN true
      ELSE false
    END
  FROM message_threads mt
  INNER JOIN contacts c
    ON c.id = mt.contact_id
    AND c.organization_id = mt.organization_id
    AND c.deleted_at IS NULL
    AND (v_can_view_all_contacts OR c.owner_user_id = v_user_id)
  LEFT JOIN users u ON u.id = mt.assigned_user_id
  LEFT JOIN message_thread_reads mtr
    ON mtr.thread_id = mt.id
    AND mtr.user_id = v_user_id
  WHERE mt.organization_id = p_organization_id
    AND (v_can_view_all_threads OR mt.assigned_user_id = v_user_id)
    AND (p_status IS NULL OR mt.status = p_status)
    AND (p_channels IS NULL OR mt.channel = ANY(p_channels))
    AND (NOT p_unassigned_only OR mt.assigned_user_id IS NULL)
    AND (p_assigned_user_id IS NULL OR mt.assigned_user_id = p_assigned_user_id)
    AND (p_cursor_updated_at IS NULL
         OR (mt.updated_at, mt.id) < (p_cursor_updated_at, p_cursor_id))
  ORDER BY mt.updated_at DESC, mt.id DESC
  LIMIT p_limit;
END;
$function$;
