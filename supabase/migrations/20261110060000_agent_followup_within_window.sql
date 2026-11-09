-- Retomada: a 2ª tentativa sempre dentro da janela de 24 h (adianta se o tempo configurado passar dela).
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

