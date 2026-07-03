
-- ============================================================
-- rpc_inbox_queue_counts
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_inbox_queue_counts(
  p_organization_id uuid,
  p_only_mine boolean,
  p_assigned_user_id uuid,
  p_resolved_since timestamptz,
  p_include_service_endpoints boolean
)
RETURNS TABLE(active bigint, waiting bigint, resolved_today bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (p_organization_id = ANY (current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden: caller is not a member of organization %', p_organization_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT t.status, t.resolved_at
    FROM public.message_threads t
    INNER JOIN public.contacts c
            ON c.id = t.contact_id
           AND c.organization_id = p_organization_id
    LEFT JOIN public.communication_endpoints e
           ON e.id = t.primary_endpoint_id
    WHERE t.organization_id = p_organization_id
      AND (NOT p_only_mine OR t.assigned_user_id = p_assigned_user_id)
      -- PR3: prefere business_context; fallback só quando NULL
      AND (
        t.business_context = 'customer_service'
        OR (
          t.business_context IS NULL
          AND (
            (c.lifecycle_stage = 'customer'
             AND (e.purpose IS NULL OR e.purpose NOT IN ('commercial','vendor_personal')))
            OR (p_include_service_endpoints AND e.purpose = 'customer_service')
          )
        )
      )
      AND (
        t.status IN ('open','in_progress','awaiting_client')
        OR (t.status = 'resolved' AND t.resolved_at >= p_resolved_since)
      )
  )
  SELECT
    COUNT(*) FILTER (WHERE status IN ('open','in_progress'))                        AS active,
    COUNT(*) FILTER (WHERE status = 'awaiting_client')                              AS waiting,
    COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= p_resolved_since) AS resolved_today
  FROM scoped;
END;
$function$;

-- ============================================================
-- rpc_list_inbox_threads
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_list_inbox_threads(
  p_organization_id uuid,
  p_tab text,
  p_only_mine boolean,
  p_assigned_user_id uuid,
  p_resolved_since timestamptz,
  p_include_service_endpoints boolean,
  p_limit integer DEFAULT 200
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (p_organization_id = ANY (current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden: caller is not a member of organization %', p_organization_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id, t.contact_id, t.channel, t.status, t.priority,
      t.assigned_user_id, t.assigned_at, t.first_response_at,
      t.sla_first_response_target_at, t.sla_resolution_target_at,
      t.last_message_at, t.last_message_content, t.last_message_direction,
      t.resolved_at, t.last_inbound_at, t.whatsapp_last_inbound_at,
      t.last_routing_decision, t.organization_id, t.primary_endpoint_id,
      c.full_name        AS c_name,
      c.phone            AS c_phone,
      c.lifecycle_stage  AS c_lifecycle,
      e.purpose          AS e_purpose,
      e.external_address AS e_addr,
      e.provider         AS e_provider
    FROM public.message_threads t
    INNER JOIN public.contacts c
            ON c.id = t.contact_id
           AND c.organization_id = p_organization_id
    LEFT JOIN public.communication_endpoints e
           ON e.id = t.primary_endpoint_id
    WHERE t.organization_id = p_organization_id
      AND (
            (p_tab = 'active'         AND t.status IN ('open','in_progress'))
         OR (p_tab = 'waiting'        AND t.status = 'awaiting_client')
         OR (p_tab = 'resolved_today' AND t.status = 'resolved'
                                      AND t.resolved_at >= p_resolved_since)
      )
      AND (NOT p_only_mine OR t.assigned_user_id = p_assigned_user_id)
      -- PR3
      AND (
        t.business_context = 'customer_service'
        OR (
          t.business_context IS NULL
          AND (
            (c.lifecycle_stage = 'customer'
             AND (e.purpose IS NULL OR e.purpose NOT IN ('commercial','vendor_personal')))
            OR (p_include_service_endpoints AND e.purpose = 'customer_service')
          )
        )
      )
    ORDER BY t.last_message_at DESC NULLS LAST
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'id', id,
    'contact_id', contact_id,
    'channel', channel,
    'status', status,
    'priority', priority,
    'assigned_user_id', assigned_user_id,
    'assigned_at', assigned_at,
    'first_response_at', first_response_at,
    'sla_first_response_target_at', sla_first_response_target_at,
    'sla_resolution_target_at', sla_resolution_target_at,
    'last_message_at', last_message_at,
    'last_message_content', last_message_content,
    'last_message_direction', last_message_direction,
    'resolved_at', resolved_at,
    'last_inbound_at', last_inbound_at,
    'whatsapp_last_inbound_at', whatsapp_last_inbound_at,
    'last_routing_decision', last_routing_decision,
    'organization_id', organization_id,
    'primary_endpoint_id', primary_endpoint_id,
    'contact', jsonb_build_object(
      'id', contact_id,
      'name', c_name,
      'phone', c_phone,
      'lifecycle_stage', c_lifecycle
    ),
    'primary_endpoint', CASE
      WHEN primary_endpoint_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', primary_endpoint_id,
        'purpose', e_purpose,
        'external_address', e_addr,
        'provider', e_provider
      )
    END
  )
  FROM base;
END;
$function$;

-- ============================================================
-- rpc_list_message_threads (assinatura sem p_search)
-- ============================================================
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
  id uuid, contact_id uuid, contact_name text, contact_phone text, channel text,
  subject text, status text, last_message_id uuid, last_message_content text,
  last_message_direction text, last_message_at timestamptz, last_inbound_at timestamptz,
  whatsapp_last_inbound_at timestamptz, needs_human_attention boolean, agent_typing boolean,
  awaiting_button_response boolean, assigned_user_id uuid, assigned_user_name text,
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
  v_cs_flag boolean;
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

  SELECT COALESCE(o.cs_inbox_includes_service_endpoints, false)
    INTO v_cs_flag
  FROM organizations o
  WHERE o.id = p_organization_id;

  RETURN QUERY
  SELECT
    mt.id, mt.contact_id, c.full_name, c.phone, mt.channel, mt.subject, mt.status,
    mt.last_message_id, mt.last_message_content, mt.last_message_direction,
    mt.last_message_at, mt.last_inbound_at, mt.whatsapp_last_inbound_at,
    mt.needs_human_attention, mt.agent_typing, mt.awaiting_button_response,
    mt.assigned_user_id, u.full_name, mt.updated_at, mt.created_at,
    CASE
      WHEN mt.last_message_direction = 'inbound'
        AND COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) IS NOT NULL
        AND (mtr.last_read_at IS NULL
             OR COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) > mtr.last_read_at)
      THEN true ELSE false
    END
  FROM message_threads mt
  INNER JOIN contacts c
    ON c.id = mt.contact_id
    AND c.organization_id = mt.organization_id
    AND c.deleted_at IS NULL
    AND (v_can_view_all_contacts OR c.owner_user_id = v_user_id OR mt.assigned_user_id IS NULL)
  LEFT JOIN users u ON u.id = mt.assigned_user_id
  LEFT JOIN message_thread_reads mtr
    ON mtr.thread_id = mt.id AND mtr.user_id = v_user_id
  LEFT JOIN communication_endpoints e
    ON e.id = mt.primary_endpoint_id
  WHERE mt.organization_id = p_organization_id
    AND (v_can_view_all_threads OR mt.assigned_user_id = v_user_id OR mt.assigned_user_id IS NULL)
    AND (p_status IS NULL OR mt.status = p_status)
    AND (p_channels IS NULL OR mt.channel = ANY(p_channels))
    AND (NOT p_unassigned_only OR mt.assigned_user_id IS NULL)
    AND (p_assigned_user_id IS NULL OR mt.assigned_user_id = p_assigned_user_id)
    -- PR3
    AND (
      mt.business_context = 'sales'
      OR (
        mt.business_context IS NULL
        AND (c.lifecycle_stage IS DISTINCT FROM 'customer')
        AND (NOT v_cs_flag OR e.id IS NULL OR e.purpose IS DISTINCT FROM 'customer_service')
      )
    )
    AND (p_cursor_updated_at IS NULL
         OR (mt.updated_at, mt.id) < (p_cursor_updated_at, p_cursor_id))
  ORDER BY mt.updated_at DESC, mt.id DESC
  LIMIT p_limit;
END;
$function$;

-- ============================================================
-- rpc_list_message_threads (assinatura com p_search)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_list_message_threads(
  p_organization_id uuid,
  p_status text DEFAULT NULL,
  p_channels text[] DEFAULT NULL,
  p_assigned_user_id uuid DEFAULT NULL,
  p_unassigned_only boolean DEFAULT false,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, contact_id uuid, contact_name text, contact_phone text, channel text,
  subject text, status text, last_message_id uuid, last_message_content text,
  last_message_direction text, last_message_at timestamptz, last_inbound_at timestamptz,
  whatsapp_last_inbound_at timestamptz, needs_human_attention boolean, agent_typing boolean,
  awaiting_button_response boolean, assigned_user_id uuid, assigned_user_name text,
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
  v_search_name text;
  v_search_digits text;
  v_cs_flag boolean;
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

  SELECT COALESCE(o.cs_inbox_includes_service_endpoints, false)
    INTO v_cs_flag
  FROM organizations o
  WHERE o.id = p_organization_id;

  IF p_search IS NOT NULL AND length(btrim(p_search)) > 0 THEN
    v_search_name := '%' || btrim(p_search) || '%';
    v_search_digits := regexp_replace(p_search, '\D', '', 'g');
    IF length(v_search_digits) = 0 THEN
      v_search_digits := NULL;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    mt.id, mt.contact_id, c.full_name, c.phone, mt.channel, mt.subject, mt.status,
    mt.last_message_id, mt.last_message_content, mt.last_message_direction,
    mt.last_message_at, mt.last_inbound_at, mt.whatsapp_last_inbound_at,
    mt.needs_human_attention, mt.agent_typing, mt.awaiting_button_response,
    mt.assigned_user_id, u.full_name, mt.updated_at, mt.created_at,
    CASE
      WHEN mt.last_message_direction = 'inbound'
        AND COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) IS NOT NULL
        AND (mtr.last_read_at IS NULL
             OR COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) > mtr.last_read_at)
      THEN true ELSE false
    END
  FROM message_threads mt
  INNER JOIN contacts c
    ON c.id = mt.contact_id
    AND c.organization_id = mt.organization_id
    AND c.deleted_at IS NULL
    AND (v_can_view_all_contacts OR c.owner_user_id = v_user_id OR mt.assigned_user_id IS NULL)
  LEFT JOIN users u ON u.id = mt.assigned_user_id
  LEFT JOIN message_thread_reads mtr
    ON mtr.thread_id = mt.id AND mtr.user_id = v_user_id
  LEFT JOIN communication_endpoints e
    ON e.id = mt.primary_endpoint_id
  WHERE mt.organization_id = p_organization_id
    AND (v_can_view_all_threads OR mt.assigned_user_id = v_user_id OR mt.assigned_user_id IS NULL)
    AND (p_status IS NULL OR mt.status = p_status)
    AND (p_channels IS NULL OR mt.channel = ANY(p_channels))
    AND (NOT p_unassigned_only OR mt.assigned_user_id IS NULL)
    AND (p_assigned_user_id IS NULL OR mt.assigned_user_id = p_assigned_user_id)
    -- PR3
    AND (
      mt.business_context = 'sales'
      OR (
        mt.business_context IS NULL
        AND (c.lifecycle_stage IS DISTINCT FROM 'customer')
        AND (NOT v_cs_flag OR e.id IS NULL OR e.purpose IS DISTINCT FROM 'customer_service')
      )
    )
    AND (
      v_search_name IS NULL
      OR c.full_name ILIKE v_search_name
      OR c.phone ILIKE v_search_name
      OR (v_search_digits IS NOT NULL AND c.phone_normalized ILIKE '%' || v_search_digits || '%')
    )
    AND (p_cursor_updated_at IS NULL
         OR (mt.updated_at, mt.id) < (p_cursor_updated_at, p_cursor_id))
  ORDER BY mt.updated_at DESC, mt.id DESC
  LIMIT p_limit;
END;
$function$;
