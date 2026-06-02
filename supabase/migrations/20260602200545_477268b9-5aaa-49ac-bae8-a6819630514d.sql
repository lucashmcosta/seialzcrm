CREATE OR REPLACE FUNCTION public.rpc_list_message_threads(p_organization_id uuid, p_status text DEFAULT NULL::text, p_channels text[] DEFAULT NULL::text[], p_assigned_user_id uuid DEFAULT NULL::uuid, p_unassigned_only boolean DEFAULT false, p_cursor_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, contact_id uuid, contact_name text, contact_phone text, channel text, subject text, status text, last_message_id uuid, last_message_content text, last_message_direction text, last_message_at timestamp with time zone, last_inbound_at timestamp with time zone, whatsapp_last_inbound_at timestamp with time zone, needs_human_attention boolean, agent_typing boolean, awaiting_button_response boolean, assigned_user_id uuid, assigned_user_name text, updated_at timestamp with time zone, created_at timestamp with time zone, is_unread boolean)
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
    AND (c.lifecycle_stage IS DISTINCT FROM 'customer')
    AND (p_cursor_updated_at IS NULL
         OR (mt.updated_at, mt.id) < (p_cursor_updated_at, p_cursor_id))
  ORDER BY mt.updated_at DESC, mt.id DESC
  LIMIT p_limit;
END;
$function$;