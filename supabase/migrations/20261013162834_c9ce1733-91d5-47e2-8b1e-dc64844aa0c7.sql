CREATE OR REPLACE FUNCTION public.rpc_search_contacts(p_organization_id uuid, p_search text DEFAULT NULL::text, p_owner_user_id uuid DEFAULT NULL::uuid, p_lifecycle_stage text DEFAULT NULL::text, p_created_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_created_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, full_name text, email text, phone text, company_name text, lifecycle_stage text, owner_user_id uuid, created_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id  uuid := current_user_id();
  v_term text; v_digits text; v_is_phone boolean := false; v_pattern text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_admin boolean := COALESCE(is_admin_user(), false);
  v_v2 boolean; v_ctx jsonb; v_all boolean := false;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT v_admin AND NOT EXISTS (SELECT 1 FROM public.user_organizations uo WHERE uo.user_id = v_user_id AND uo.organization_id = p_organization_id AND uo.is_active = true) THEN
    RAISE EXCEPTION 'not_a_member_of_organization';
  END IF;
  v_v2 := rbac_v2_on(p_organization_id);
  IF v_v2 THEN v_ctx := rbac_ctx(); ELSE v_all := COALESCE(user_can_view_all(p_organization_id, 'contacts'), false); END IF;

  v_term := NULLIF(btrim(COALESCE(p_search, '')), '');
  IF v_term IS NOT NULL THEN
    v_digits := regexp_replace(v_term, '[^0-9]', '', 'g');
    IF length(v_digits) >= 4 AND v_term ~ '^[0-9[:space:]()+-]+$' THEN v_is_phone := true; END IF;
  END IF;
  IF v_is_phone THEN v_pattern := '%' || v_digits || '%';
  ELSIF v_term IS NOT NULL THEN v_pattern := '%' || lower(v_term) || '%'; END IF;

  -- Escopo aplicado dentro de "base", ANTES do count e do LIMIT/OFFSET.
  RETURN QUERY WITH base AS (
    SELECT c.id, c.full_name, c.email, c.phone, c.company_name, c.lifecycle_stage::text AS lifecycle_stage, c.owner_user_id, c.created_at
    FROM public.contacts c
    WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
      AND (v_term IS NULL
           OR (v_is_phone AND c.phone_digits ILIKE v_pattern)
           OR (NOT v_is_phone AND (c.search_name ILIKE v_pattern OR c.search_email ILIKE v_pattern)))
      AND (p_owner_user_id IS NULL OR c.owner_user_id = p_owner_user_id)
      AND (p_lifecycle_stage IS NULL OR c.lifecycle_stage::text = p_lifecycle_stage)
      AND (p_created_from IS NULL OR c.created_at >= p_created_from)
      AND (p_created_to IS NULL OR c.created_at <= p_created_to)
      AND (v_admin OR CASE WHEN v_v2
            THEN rbac_check(v_ctx, c.organization_id, 'contatos', 'ver', ARRAY[c.owner_user_id])
            ELSE (v_all OR c.owner_user_id = v_user_id) END)
  ), counted AS (SELECT count(*)::bigint AS n FROM base)
  SELECT b.id, b.full_name, b.email, b.phone, b.company_name, b.lifecycle_stage, b.owner_user_id, b.created_at, (SELECT n FROM counted) AS total_count
  FROM base b ORDER BY b.created_at DESC LIMIT v_limit OFFSET v_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_inbox_queue_counts(p_organization_id uuid, p_only_mine boolean, p_assigned_user_id uuid, p_resolved_since timestamp with time zone, p_include_service_endpoints boolean)
 RETURNS TABLE(active bigint, waiting bigint, resolved_today bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := current_user_id();
  v_admin boolean := COALESCE(is_admin_user(), false);
  v_v2 boolean; v_ctx jsonb; v_all boolean := false; v_queue boolean := false;
BEGIN
  IF NOT (p_organization_id = ANY (current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden: caller is not a member of organization %', p_organization_id USING ERRCODE = '42501';
  END IF;
  v_v2 := rbac_v2_on(p_organization_id);
  IF v_v2 THEN v_ctx := rbac_ctx();
  ELSE
    v_all := COALESCE(user_can_view_all(p_organization_id, 'threads'), false);
    v_queue := COALESCE(user_has_cs_permission(p_organization_id, 'can_manage_cs_queue'), false);
  END IF;
  RETURN QUERY
  WITH scoped AS (
    SELECT t.status, t.resolved_at
    FROM public.message_threads t
    INNER JOIN public.contacts c ON c.id = t.contact_id AND c.organization_id = p_organization_id
    LEFT JOIN public.communication_endpoints e ON e.id = t.primary_endpoint_id
    WHERE t.organization_id = p_organization_id
      AND (NOT p_only_mine OR t.assigned_user_id = p_assigned_user_id)
      AND (t.business_context = 'customer_service'
        OR (t.business_context IS NULL AND (
            (c.lifecycle_stage = 'customer' AND (e.purpose IS NULL OR e.purpose NOT IN ('commercial','vendor_personal')))
            OR (p_include_service_endpoints AND e.purpose = 'customer_service'))))
      AND (t.status IN ('open','in_progress','awaiting_client') OR (t.status = 'resolved' AND t.resolved_at >= p_resolved_since))
      AND (v_admin OR CASE WHEN v_v2
            THEN rbac_check(v_ctx, t.organization_id, rbac_thread_obj(t.business_context), 'ver', ARRAY[t.assigned_user_id])
            ELSE (v_all OR t.assigned_user_id = v_me OR (t.assigned_user_id IS NULL AND v_queue)) END)
  )
  SELECT COUNT(*) FILTER (WHERE status IN ('open','in_progress','awaiting_client')),
         COUNT(*) FILTER (WHERE status = 'awaiting_client'),
         COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= p_resolved_since)
  FROM scoped;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_list_inbox_threads(p_organization_id uuid, p_tab text, p_only_mine boolean, p_assigned_user_id uuid, p_resolved_since timestamp with time zone, p_include_service_endpoints boolean, p_limit integer DEFAULT 200, p_unassigned_only boolean DEFAULT false)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := current_user_id();
  v_admin boolean := COALESCE(is_admin_user(), false);
  v_v2 boolean; v_ctx jsonb; v_all boolean := false; v_queue boolean := false;
BEGIN
  IF NOT (p_organization_id = ANY (current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden: caller is not a member of organization %', p_organization_id USING ERRCODE = '42501';
  END IF;
  v_v2 := rbac_v2_on(p_organization_id);
  IF v_v2 THEN v_ctx := rbac_ctx();
  ELSE
    v_all := COALESCE(user_can_view_all(p_organization_id, 'threads'), false);
    v_queue := COALESCE(user_has_cs_permission(p_organization_id, 'can_manage_cs_queue'), false);
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT t.id, t.contact_id, t.channel, t.status, t.priority, t.assigned_user_id, t.assigned_at, t.first_response_at,
      t.sla_first_response_target_at, t.sla_resolution_target_at, t.last_message_at, t.last_message_content, t.last_message_direction,
      t.resolved_at, t.last_inbound_at, t.whatsapp_last_inbound_at, t.last_routing_decision, t.organization_id, t.primary_endpoint_id,
      c.full_name AS c_name, c.phone AS c_phone, c.lifecycle_stage AS c_lifecycle,
      e.purpose AS e_purpose, e.external_address AS e_addr, e.provider AS e_provider
    FROM public.message_threads t
    INNER JOIN public.contacts c ON c.id = t.contact_id AND c.organization_id = p_organization_id
    LEFT JOIN public.communication_endpoints e ON e.id = t.primary_endpoint_id
    WHERE t.organization_id = p_organization_id
      AND ((p_tab = 'active' AND t.status IN ('open','in_progress','awaiting_client'))
        OR (p_tab = 'waiting' AND t.status = 'awaiting_client')
        OR (p_tab = 'resolved_today' AND t.status = 'resolved' AND t.resolved_at >= p_resolved_since))
      AND (NOT p_only_mine OR t.assigned_user_id = p_assigned_user_id)
      AND (NOT COALESCE(p_unassigned_only, false) OR t.assigned_user_id IS NULL)
      AND (t.business_context = 'customer_service'
        OR (t.business_context IS NULL AND (
            (c.lifecycle_stage = 'customer' AND (e.purpose IS NULL OR e.purpose NOT IN ('commercial','vendor_personal')))
            OR (p_include_service_endpoints AND e.purpose = 'customer_service'))))
      AND (v_admin OR CASE WHEN v_v2
            THEN rbac_check(v_ctx, t.organization_id, rbac_thread_obj(t.business_context), 'ver', ARRAY[t.assigned_user_id])
            ELSE (v_all OR t.assigned_user_id = v_me OR (t.assigned_user_id IS NULL AND v_queue)) END)
    ORDER BY t.last_message_at DESC NULLS LAST
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'id', id, 'contact_id', contact_id, 'channel', channel, 'status', status,
    'priority', priority, 'assigned_user_id', assigned_user_id, 'assigned_at', assigned_at,
    'first_response_at', first_response_at,
    'sla_first_response_target_at', sla_first_response_target_at,
    'sla_resolution_target_at', sla_resolution_target_at,
    'last_message_at', last_message_at, 'last_message_content', last_message_content,
    'last_message_direction', last_message_direction, 'resolved_at', resolved_at,
    'last_inbound_at', last_inbound_at, 'whatsapp_last_inbound_at', whatsapp_last_inbound_at,
    'last_routing_decision', last_routing_decision, 'organization_id', organization_id,
    'primary_endpoint_id', primary_endpoint_id,
    'contact', jsonb_build_object('id', contact_id, 'name', c_name, 'phone', c_phone, 'lifecycle_stage', c_lifecycle),
    'primary_endpoint', CASE WHEN primary_endpoint_id IS NULL THEN NULL
      ELSE jsonb_build_object('id', primary_endpoint_id, 'purpose', e_purpose, 'external_address', e_addr, 'provider', e_provider) END)
  FROM base;
END;
$function$;

NOTIFY pgrst, 'reload schema';