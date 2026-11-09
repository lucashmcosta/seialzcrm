-- Retomada automática: o agente volta a falar com quem parou de responder.
-- Só dentro da janela de 24 h do WhatsApp, no horário da org (8h às 20h) e com limite de tentativas.
alter table public.ai_agents
  add column if not exists followup_enabled boolean not null default false,
  add column if not exists followup_delays_minutes integer[] not null default '{120,1200}';
alter table public.message_threads
  add column if not exists ai_followup_count integer not null default 0,
  add column if not exists ai_followup_last_at timestamptz;

-- Escolhe e já marca as conversas que devem receber retomada agora. Marcar antes de enviar
-- evita duas retomadas se a rotina rodar em paralelo. A contagem zera quando o cliente responde.
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
      and c.last_at <= now() - make_interval(mins => c.d[c.eff + 1])
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

-- A cada 10 minutos.
select cron.unschedule('agent-followups') where exists (select 1 from cron.job where jobname = 'agent-followups');
select cron.schedule('agent-followups', '*/10 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/agent-followups',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
