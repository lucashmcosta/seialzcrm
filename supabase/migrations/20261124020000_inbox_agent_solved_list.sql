-- Lista "Agente resolveu hoje" na Inbox de atendimento.
--
-- Mesma regra do número "Agente hoje · N resolvidas" (rpc_inbox_agent_stats): conversas em que
-- o agente de atendimento respondeu desde p_since e que não foram passadas para a equipe desde
-- então. Devolve o mesmo formato de rpc_list_inbox_threads e respeita a mesma visibilidade
-- (membro da org + permissão de ver conversas). Vale para qualquer org.

create or replace function public.rpc_list_agent_solved_threads(
  p_organization_id uuid,
  p_since timestamptz,
  p_only_mine boolean default false,
  p_assigned_user_id uuid default null,
  p_limit integer default 200)
returns setof jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
  WITH handled AS (
    SELECT DISTINCT m.thread_id
      FROM public.messages m
      JOIN public.ai_agents ag ON ag.id = m.sender_agent_id AND ag.agent_type = 'support'
     WHERE m.organization_id = p_organization_id
       AND m.sender_type = 'agent'
       AND m.direction = 'outbound'
       AND m.created_at >= p_since
  ), base AS (
    SELECT t.id, t.contact_id, t.channel, t.status, t.priority, t.assigned_user_id, t.assigned_at, t.first_response_at,
      t.sla_first_response_target_at, t.sla_resolution_target_at, t.last_message_at, t.last_message_content, t.last_message_direction,
      t.resolved_at, t.last_inbound_at, t.whatsapp_last_inbound_at, t.last_routing_decision, t.organization_id, t.primary_endpoint_id,
      t.needs_human_attention, t.ai_agent_id, t.ai_agent_released_at, a.name AS a_name,
      c.full_name AS c_name, c.phone AS c_phone, c.lifecycle_stage AS c_lifecycle,
      e.purpose AS e_purpose, e.external_address AS e_addr, e.provider AS e_provider
    FROM handled h
    JOIN public.message_threads t ON t.id = h.thread_id
    INNER JOIN public.contacts c ON c.id = t.contact_id AND c.organization_id = p_organization_id
    LEFT JOIN public.communication_endpoints e ON e.id = t.primary_endpoint_id
    LEFT JOIN public.ai_agents a ON a.id = t.ai_agent_id AND a.organization_id = p_organization_id
    WHERE t.organization_id = p_organization_id
      AND (t.ai_agent_released_at IS NULL OR t.ai_agent_released_at < p_since)
      AND (NOT p_only_mine OR t.assigned_user_id = p_assigned_user_id)
      AND (v_admin OR CASE WHEN v_v2
            THEN rbac_check(v_ctx, t.organization_id, rbac_thread_obj(t.business_context), 'ver', ARRAY[t.assigned_user_id])
            ELSE (v_all OR t.assigned_user_id = v_me OR (t.assigned_user_id IS NULL AND v_queue)) END)
    ORDER BY t.last_message_at DESC NULLS LAST
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500)
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
    'needs_human_attention', COALESCE(needs_human_attention, false),
    'ai_agent_released_at', ai_agent_released_at,
    'agent', CASE WHEN ai_agent_id IS NULL THEN NULL ELSE jsonb_build_object('id', ai_agent_id, 'name', a_name) END,
    'contact', jsonb_build_object('id', contact_id, 'name', c_name, 'phone', c_phone, 'lifecycle_stage', c_lifecycle),
    'primary_endpoint', CASE WHEN primary_endpoint_id IS NULL THEN NULL
      ELSE jsonb_build_object('id', primary_endpoint_id, 'purpose', e_purpose, 'external_address', e_addr, 'provider', e_provider) END)
  FROM base;
END;
$function$;

revoke all on function public.rpc_list_agent_solved_threads(uuid, timestamptz, boolean, uuid, integer) from public, anon;
grant execute on function public.rpc_list_agent_solved_threads(uuid, timestamptz, boolean, uuid, integer) to authenticated;
