-- Números do agente de atendimento para a Inbox: quantas conversas ele atendeu desde
-- `p_since`, quantas passou para a equipe e por qual setor, e a meta de passagem.
--
-- Atendida = conversa do atendimento em que o agente (agent_type 'support') mandou
-- alguma mensagem desde p_since. Passada = dessas, as que ele passou para a equipe
-- (ai_agent_released_at) desde p_since. O setor vem de last_routing_decision.area.
-- A meta (% máximo passado para a equipe) fica em ai_agents.tool_settings.handoff_target_pct
-- do agente de atendimento; sem valor, 30.

create or replace function public.rpc_inbox_agent_stats(p_organization_id uuid, p_since timestamptz)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_target numeric;
  v_out jsonb;
begin
  if not (p_organization_id = any (current_user_org_ids())) then
    raise exception 'forbidden: caller is not a member of organization %', p_organization_id using errcode = '42501';
  end if;

  select coalesce(nullif(a.tool_settings->>'handoff_target_pct', '')::numeric, 30)
    into v_target
    from ai_agents a
   where a.organization_id = p_organization_id and a.agent_type = 'support'
   order by a.is_enabled desc, a.updated_at desc
   limit 1;

  with handled as (
    select distinct m.thread_id
      from messages m
      join ai_agents a on a.id = m.sender_agent_id and a.agent_type = 'support'
     where m.organization_id = p_organization_id
       and m.sender_type = 'agent'
       and m.direction = 'outbound'
       and m.created_at >= p_since
  ), t as (
    select th.id, th.ai_agent_released_at, th.last_routing_decision
      from handled h join message_threads th on th.id = h.thread_id
     where th.organization_id = p_organization_id
  )
  select jsonb_build_object(
    'handled', count(*),
    'escalated', count(*) filter (where ai_agent_released_at >= p_since),
    'urgent', count(*) filter (where ai_agent_released_at >= p_since and (last_routing_decision->>'urgent')::boolean is true),
    'by_area', coalesce((
      select jsonb_object_agg(area, n) from (
        select coalesce(nullif(t2.last_routing_decision->>'area', ''), 'Sem setor') area, count(*) n
          from t t2 where t2.ai_agent_released_at >= p_since group by 1) x), '{}'::jsonb),
    'target_pct', coalesce(v_target, 30))
    into v_out
    from t;
  return v_out;
end;
$function$;

revoke all on function public.rpc_inbox_agent_stats(uuid, timestamptz) from public, anon;
grant execute on function public.rpc_inbox_agent_stats(uuid, timestamptz) to authenticated;
