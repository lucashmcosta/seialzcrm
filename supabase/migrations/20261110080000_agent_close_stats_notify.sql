-- Agente encerra a conversa de quem não se encaixa (status resolvida, ai_agent_closed_at),
-- números do agente no card e aviso de "precisa de atendimento" só para o dono da conversa.
alter table public.message_threads add column if not exists ai_agent_closed_at timestamptz;

-- Retomada não sai em conversa resolvida ou fechada.
create or replace function public.fn_agent_followup_claim(_limit integer default 20)
returns table(thread_id uuid, contact_id uuid, agent_id uuid, organization_id uuid, attempt integer, total integer)
language plpgsql security definer set search_path to 'public' as $$
begin
  return query
  with cand as (
    select t.id, t.contact_id, a.id as agent_id, t.organization_id, a.followup_delays_minutes as d,
           coalesce(a.working_hours->>'timezone', 'America/Sao_Paulo') as tz,
           li.last_in, lm.direction as last_dir, lm.sender_type as last_sender, lm.sent_at as last_at,
           case when t.ai_followup_last_at is not null and t.ai_followup_last_at > coalesce(li.last_in, '-infinity'::timestamptz)
                then t.ai_followup_count else 0 end as eff
    from message_threads t
    join ai_agents a on a.id = t.ai_agent_id and a.is_enabled and a.followup_enabled
    cross join lateral (
      select max(m.sent_at) as last_in from messages m
      where m.thread_id = t.id and m.direction = 'inbound' and m.deleted_at is null
    ) li
    cross join lateral (
      select m.direction, m.sender_type, m.sent_at from messages m
      where m.thread_id = t.id and m.deleted_at is null and coalesce(m.is_internal_note, false) = false
      order by m.sent_at desc limit 1
    ) lm
    where t.ai_agent_id is not null and t.ai_agent_released_at is null
      and t.assigned_user_id is null and coalesce(t.needs_human_attention, false) = false
      and t.status not in ('resolved', 'closed')
  ), due as (
    select c.* from cand c
    where c.last_dir = 'outbound' and c.last_sender = 'agent'
      and c.last_in is not null and c.last_in > now() - interval '23 hours'
      and c.eff < coalesce(array_length(c.d, 1), 0)
      -- Cada tentativa sai no tempo configurado, mas nunca depois de 22 h da última mensagem do
      -- cliente: assim a 2ª retomada sempre cabe na janela de 24 h do WhatsApp.
      -- Se o limite cair de noite, adianta para as 20h do mesmo dia (ou do dia anterior, de madrugada).
      and now() >= least(
        c.last_at + make_interval(mins => c.d[c.eff + 1]),
        (case
           when extract(hour from (c.last_in + interval '22 hours') at time zone c.tz) >= 21
             then date_trunc('day', (c.last_in + interval '22 hours') at time zone c.tz) + interval '20 hours'
           when extract(hour from (c.last_in + interval '22 hours') at time zone c.tz) < 8
             then date_trunc('day', (c.last_in + interval '22 hours') at time zone c.tz) - interval '4 hours'
           else (c.last_in + interval '22 hours') at time zone c.tz
         end) at time zone c.tz
      )
      -- Entre uma retomada e a seguinte, pelo menos 1h30.
      and (c.eff = 0 or c.last_at <= now() - interval '90 minutes')
      and extract(hour from now() at time zone c.tz) between 8 and 20
    order by c.last_at
    limit _limit
  )
  update message_threads t
     set ai_followup_count = due.eff + 1, ai_followup_last_at = now()
    from due
   where t.id = due.id
  returning t.id, due.contact_id, due.agent_id, t.organization_id, due.eff + 1, coalesce(array_length(due.d, 1), 0);
end $$;
revoke all on function public.fn_agent_followup_claim(integer) from public, anon, authenticated;
grant execute on function public.fn_agent_followup_claim(integer) to service_role;



-- Aviso "precisa de atendimento": para quem é responsável pela conversa (ou dono do contato).
-- Só sem nenhum dos dois o aviso vai para todos da org, como antes. A passagem do agente já
-- avisa o vendedor escolhido e continua sem este aviso.
CREATE OR REPLACE FUNCTION public.handle_handoff_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_name text;
  v_owner uuid;
BEGIN
  IF NEW.needs_human_attention = true
     AND (OLD.needs_human_attention = false OR OLD.needs_human_attention IS NULL) THEN

    IF NEW.ai_agent_released_at IS NOT NULL AND OLD.ai_agent_released_at IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT full_name, owner_user_id INTO v_contact_name, v_owner
    FROM contacts WHERE id = NEW.contact_id;
    v_owner := COALESCE(NEW.assigned_user_id, v_owner);

    INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id)
    SELECT
      NEW.organization_id,
      uo.user_id,
      'handoff',
      'Conversa transferida para atendimento',
      'A conversa com ' || COALESCE(v_contact_name, 'contato') || ' precisa de atendimento humano',
      'message_thread',
      NEW.id
    FROM user_organizations uo
    WHERE uo.organization_id = NEW.organization_id
      AND uo.is_active = true
      AND (v_owner IS NULL OR uo.user_id = v_owner);
  END IF;

  RETURN NEW;
END;
$function$;

-- Números do agente no card: além de leads, passados e ganhos, os que ele encerrou e as retomadas.
create or replace function public.rpc_agent_distribution_stats(_org uuid, _days integer default 30)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public.can_manage_integrations_in_org(_org) then raise exception 'forbidden'; end if;
  with leads as (
    select t.id, t.contact_id, t.ai_agent_id is not null as com_agente, t.ai_agent_released_at is not null as passou,
           t.ai_agent_closed_at is not null as encerrou, t.ai_followup_count > 0 as retomado,
           (t.ai_followup_last_at is not null and exists (
             select 1 from messages m where m.thread_id = t.id and m.direction = 'inbound' and m.sent_at > t.ai_followup_last_at
           )) as voltou
    from message_threads t
    join contacts c on c.id = t.contact_id
    where t.organization_id = _org and t.channel = 'whatsapp'
      and t.created_at > now() - make_interval(days => greatest(_days, 1))
      and c.source in ('whatsapp', 'ctwa')
      and coalesce(t.business_context, 'sales') <> 'customer_service'
  ), res as (
    select l.*, exists (
      select 1 from opportunities o where o.contact_id = l.contact_id and o.status = 'won' and o.deleted_at is null
    ) as ganhou from leads l
  )
  select jsonb_build_object(
    'agent_leads', count(*) filter (where com_agente),
    'agent_handed_off', count(*) filter (where com_agente and passou),
    'agent_closed', count(*) filter (where com_agente and encerrou),
    'agent_followed_up', count(*) filter (where com_agente and retomado),
    'agent_replied_after_followup', count(*) filter (where com_agente and voltou),
    'agent_won', count(*) filter (where com_agente and ganhou),
    'human_leads', count(*) filter (where not com_agente),
    'human_won', count(*) filter (where not com_agente and ganhou)
  ) into r from res;
  return r;
end;
$$;
revoke all on function public.rpc_agent_distribution_stats(uuid, integer) from public, anon;
grant execute on function public.rpc_agent_distribution_stats(uuid, integer) to authenticated;

