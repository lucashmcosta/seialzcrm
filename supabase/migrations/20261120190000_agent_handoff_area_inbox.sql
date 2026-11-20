-- Passagem do agente para a equipe com setor e urgência visíveis.
--
-- 1. fn_agent_release_thread: lê o começo do resumo que o agente escreve
--    ("URGENTE [FINANCEIRO] ...") e grava em last_routing_decision
--    {area, urgent, agent_name}. O título da notificação muda com o tipo do agente:
--    atendimento (support) → "Cliente precisa de você · Financeiro" (com "URGENTE · " na
--    frente quando for o caso); comercial continua "Lead passado pelo agente".
--    O setor vem do texto entre colchetes, sem lista fixa: vale para qualquer org.
-- 2. rpc_list_inbox_threads: devolve needs_human_attention, ai_agent_released_at e o
--    agente da conversa, para a lista da Inbox mostrar "Com <agente>" e "Precisa de você".
-- Assinaturas iguais às anteriores.

create or replace function public.fn_agent_release_thread(_thread uuid, _reason text, _summary text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t record;
  v_owner uuid;
  v_agent_name text;
  v_agent_type text;
  v_summary text := nullif(btrim(coalesce(_summary, '')), '');
  v_urgent boolean;
  v_area text;
  v_title text;
begin
  select id, organization_id, contact_id, ai_agent_id, ai_agent_released_at, assigned_user_id
    into t from message_threads where id = _thread for update;
  if t.id is null or t.ai_agent_id is null then return jsonb_build_object('ok', false, 'error', 'not_agent_thread'); end if;
  if t.ai_agent_released_at is not null then return jsonb_build_object('ok', true, 'already', true); end if;

  v_owner := t.assigned_user_id;
  if v_owner is null and t.contact_id is not null then
    select owner_user_id into v_owner from contacts where id = t.contact_id;
  end if;
  if v_owner is null then v_owner := assign_round_robin(t.organization_id); end if;

  select name, agent_type into v_agent_name, v_agent_type from ai_agents where id = t.ai_agent_id;

  -- "URGENTE [JURÍDICO] Cliente ..." → urgente + Jurídico. Só olha o começo do resumo.
  v_urgent := coalesce(v_summary ~* '^\s*\[?\s*urgente', false);
  -- O setor é o primeiro [ ... ] do começo do resumo, depois de um "URGENTE" opcional.
  v_area := initcap(lower(btrim(substring(coalesce(v_summary, '')
    from '(?i)^\s*(?:\[?\s*urgente\s*\]?\s*[-:·]?\s*)?\[\s*([^\]\[]{2,30}?)\s*\]'))));

  update message_threads set
    ai_agent_released_at = now(),
    ai_agent_release_reason = _reason,
    needs_human_attention = true,
    assigned_user_id = coalesce(assigned_user_id, v_owner),
    original_owner_user_id = coalesce(original_owner_user_id, v_owner),
    assigned_at = case when assigned_user_id is null and v_owner is not null then now() else assigned_at end,
    last_routing_decision = jsonb_build_object(
      'action', 'agent_handoff', 'reason', _reason, 'decided_at', now(),
      'area', v_area, 'urgent', v_urgent, 'agent_name', v_agent_name)
  where id = _thread;

  if v_owner is not null and t.contact_id is not null then
    update contacts set owner_user_id = v_owner where id = t.contact_id and owner_user_id is null;
  end if;

  insert into messages (organization_id, thread_id, content, direction, is_internal_note, sender_type, sender_agent_id, sender_name, sent_at)
  values (
    t.organization_id, _thread,
    coalesce(v_summary, 'Passado para humano. Motivo: ' || _reason),
    'internal', true, 'system', t.ai_agent_id, v_agent_name, now()
  );

  if v_owner is not null then
    v_title := case
      when v_agent_type = 'support' then
        (case when v_urgent then 'URGENTE · ' else '' end) || 'Cliente precisa de você' || coalesce(' · ' || v_area, '')
      else 'Lead passado pelo agente'
    end;
    insert into notifications (user_id, organization_id, type, title, body, entity_type, entity_id)
    values (v_owner, t.organization_id, 'whatsapp_message', v_title,
            left(coalesce(v_summary, _reason), 200), 'message', _thread);
  end if;
  return jsonb_build_object('ok', true, 'assigned_user_id', v_owner);
end;
$function$;

create or replace function public.rpc_list_inbox_threads(p_organization_id uuid, p_tab text, p_only_mine boolean, p_assigned_user_id uuid, p_resolved_since timestamp with time zone, p_include_service_endpoints boolean, p_limit integer default 200, p_unassigned_only boolean default false)
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
  WITH base AS (
    SELECT t.id, t.contact_id, t.channel, t.status, t.priority, t.assigned_user_id, t.assigned_at, t.first_response_at,
      t.sla_first_response_target_at, t.sla_resolution_target_at, t.last_message_at, t.last_message_content, t.last_message_direction,
      t.resolved_at, t.last_inbound_at, t.whatsapp_last_inbound_at, t.last_routing_decision, t.organization_id, t.primary_endpoint_id,
      t.needs_human_attention, t.ai_agent_id, t.ai_agent_released_at, a.name AS a_name,
      c.full_name AS c_name, c.phone AS c_phone, c.lifecycle_stage AS c_lifecycle,
      e.purpose AS e_purpose, e.external_address AS e_addr, e.provider AS e_provider
    FROM public.message_threads t
    INNER JOIN public.contacts c ON c.id = t.contact_id AND c.organization_id = p_organization_id
    LEFT JOIN public.communication_endpoints e ON e.id = t.primary_endpoint_id
    LEFT JOIN public.ai_agents a ON a.id = t.ai_agent_id AND a.organization_id = p_organization_id
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
    'needs_human_attention', COALESCE(needs_human_attention, false),
    'ai_agent_released_at', ai_agent_released_at,
    'agent', CASE WHEN ai_agent_id IS NULL THEN NULL ELSE jsonb_build_object('id', ai_agent_id, 'name', a_name) END,
    'contact', jsonb_build_object('id', contact_id, 'name', c_name, 'phone', c_phone, 'lifecycle_stage', c_lifecycle),
    'primary_endpoint', CASE WHEN primary_endpoint_id IS NULL THEN NULL
      ELSE jsonb_build_object('id', primary_endpoint_id, 'purpose', e_purpose, 'external_address', e_addr, 'provider', e_provider) END)
  FROM base;
END;
$function$;
