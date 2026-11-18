-- Avaliação do agente de atendimento: "Consegui te ajudar?" (Sim / Não).
--
-- A pergunta sai quando a conversa de atendimento esfria: a última mensagem é
-- do agente, o cliente não respondeu há 30 min, ninguém foi chamado e a janela
-- de 24 h do WhatsApp continua aberta. Uma pergunta por conversa por dia.
-- A resposta é lida no ramo de atendimento do ai-agent-respond, antes de
-- chamar o modelo (sem custo de IA).
--
-- Só agentes com agent_type = 'support'. O agente comercial não pergunta nem
-- tem a resposta interpretada. Liga por organização com a flag
-- `support_agent_rating`.

create table if not exists public.support_agent_ratings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  agent_id uuid references public.ai_agents(id) on delete set null,
  -- Dia (horário de Brasília) em que a pergunta foi feita: uma por conversa por dia.
  asked_on date not null,
  asked_at timestamptz not null default now(),
  ask_status text not null default 'pending' check (ask_status in ('pending', 'sent', 'failed')),
  ask_message_id uuid,
  answer text check (answer in ('yes', 'no')),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_agent_ratings_once_per_day unique (thread_id, asked_on)
);
create index if not exists idx_support_agent_ratings_open
  on public.support_agent_ratings (thread_id, asked_at desc) where answer is null and ask_status = 'sent';
create index if not exists idx_support_agent_ratings_org
  on public.support_agent_ratings (organization_id, asked_at desc);

alter table public.support_agent_ratings enable row level security;
revoke all on public.support_agent_ratings from public, anon, authenticated;
grant select on public.support_agent_ratings to authenticated;
grant all on public.support_agent_ratings to service_role;

drop policy if exists "org members read support agent ratings" on public.support_agent_ratings;
create policy "org members read support agent ratings"
  on public.support_agent_ratings for select to authenticated
  using (organization_id = any (public.current_user_org_ids()));

-- Conversas que devem receber a pergunta agora. Reserva a pergunta do dia na
-- mesma instrução (insert com chave única): duas execuções ao mesmo tempo não
-- perguntam duas vezes.
create or replace function public.support_rating_claim_due(
  _limit integer default 20,
  _idle_minutes integer default 30
) returns setof public.support_agent_ratings
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select t.id as thread_id, t.organization_id, t.contact_id, t.ai_agent_id
      from public.message_threads t
      join public.ai_agents a on a.id = t.ai_agent_id
      join public.contacts c on c.id = t.contact_id
      join lateral (
        select m.direction, m.sender_type, coalesce(m.sent_at, m.created_at) as at
          from public.messages m
         where m.thread_id = t.id and m.deleted_at is null and coalesce(m.is_internal_note, false) = false
         order by coalesce(m.sent_at, m.created_at) desc
         limit 1
      ) last on true
     where t.business_context = 'customer_service'
       and t.channel = 'whatsapp'
       and a.agent_type = 'support'
       and a.is_enabled
       -- a conversa continua com o agente: ninguém foi chamado nem assumiu
       and t.ai_agent_released_at is null
       and coalesce(t.needs_human_attention, false) = false
       and coalesce(c.do_not_contact, false) = false
       -- a última palavra foi do agente, há pelo menos _idle_minutes e no máximo 12 h
       and last.direction = 'outbound' and last.sender_type = 'agent'
       and last.at <= now() - make_interval(mins => greatest(_idle_minutes, 5))
       and last.at >= now() - interval '12 hours'
       -- janela de 24 h aberta (com 1 h de folga): botões só saem dentro dela
       and t.whatsapp_last_inbound_at > now() - interval '23 hours'
       and public.fn_feature_flag_enabled('support_agent_rating', t.organization_id)
     order by last.at
     limit greatest(1, least(coalesce(_limit, 20), 100))
  )
  insert into public.support_agent_ratings (organization_id, thread_id, contact_id, agent_id, asked_on)
  select due.organization_id, due.thread_id, due.contact_id, due.ai_agent_id,
         (now() at time zone 'America/Sao_Paulo')::date
    from due
  on conflict (thread_id, asked_on) do nothing
  returning *;
end;
$$;
revoke all on function public.support_rating_claim_due(integer, integer) from public, anon, authenticated;
grant execute on function public.support_rating_claim_due(integer, integer) to service_role;

-- Resultado do envio da pergunta. Falha não é repetida no mesmo dia.
create or replace function public.support_rating_mark_asked(
  _rating_id uuid,
  _sent boolean,
  _message_id uuid default null
) returns void
language sql
security definer
set search_path = public
as $$
  update public.support_agent_ratings
     set ask_status = case when _sent then 'sent' else 'failed' end,
         ask_message_id = _message_id,
         asked_at = case when _sent then now() else asked_at end
   where id = _rating_id and ask_status = 'pending';
$$;
revoke all on function public.support_rating_mark_asked(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.support_rating_mark_asked(uuid, boolean, uuid) to service_role;

-- Há pergunta em aberto nesta conversa? (enviada há menos de 24 h, sem resposta)
create or replace function public.support_rating_open(_thread_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id
    from public.support_agent_ratings r
   where r.thread_id = _thread_id and r.ask_status = 'sent' and r.answer is null
     and r.asked_at > now() - interval '24 hours'
   order by r.asked_at desc
   limit 1;
$$;
revoke all on function public.support_rating_open(uuid) from public, anon, authenticated;
grant execute on function public.support_rating_open(uuid) to service_role;

-- Grava a resposta. Só a primeira vale: devolve true quando gravou.
create or replace function public.support_rating_record(_rating_id uuid, _answer text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_rows integer;
begin
  if _answer not in ('yes', 'no') then
    raise exception 'SUPPORT_RATING_RESPOSTA_INVALIDA' using errcode = '22023';
  end if;
  update public.support_agent_ratings
     set answer = _answer, answered_at = now()
   where id = _rating_id and answer is null and ask_status = 'sent';
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;
revoke all on function public.support_rating_record(uuid, text) from public, anon, authenticated;
grant execute on function public.support_rating_record(uuid, text) to service_role;
