-- Análise da conversa inteira do atendimento (tela de atendimento, business_context = 'customer_service').
-- Vale para todas as orgs. Roda dentro da org, com a chave Claude da própria org, pela função
-- conversation-analysis (ações service_start / service_report). Lê sempre a conversa inteira.
-- Separada da análise de vendas (conversation_analyses), que é por oportunidade ganha/perdida.

alter table public.conversation_analysis_runs drop constraint if exists conversation_analysis_runs_kind_check;
alter table public.conversation_analysis_runs add constraint conversation_analysis_runs_kind_check
  check (kind in ('conversations', 'report', 'service_conversations', 'service_report'));

create table if not exists public.service_conversation_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.conversation_analysis_runs(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  contact_id uuid,
  assigned_user_id uuid,
  first_message_at timestamptz,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  message_count integer not null default 0,
  lead_message_count integer not null default 0,
  team_message_count integer not null default 0,
  audio_count integer not null default 0,
  transcript_chars integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  analysis jsonb,
  error text,
  prompt_tokens integer,
  completion_tokens integer,
  cost_usd numeric(12, 6),
  analysis_version text not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, thread_id)
);

create index if not exists service_conversation_analyses_org_thread_idx
  on public.service_conversation_analyses (organization_id, thread_id);

revoke all on public.service_conversation_analyses from anon;
grant select on public.service_conversation_analyses to authenticated;
grant all on public.service_conversation_analyses to service_role;
alter table public.service_conversation_analyses enable row level security;
drop policy if exists service_conversation_analyses_select on public.service_conversation_analyses;
create policy service_conversation_analyses_select on public.service_conversation_analyses
  for select to authenticated using (organization_id = any (public.current_user_org_ids()));

-- Amostra do atendimento: conversas com mensagem do cliente nos últimos p_days, pelo menos 2
-- mensagens do cliente, as mais recentes primeiro. Pula as que já têm análise pronta, para que
-- cada lote pegue conversas novas.
create or replace function public.service_analysis_candidates(p_org uuid, p_days integer, p_limit integer)
returns table (thread_id uuid, contact_id uuid, assigned_user_id uuid, last_inbound_at timestamptz)
language sql
stable
set search_path = public
as $$
  with recent as (
    select t.id, t.contact_id, t.assigned_user_id,
           max(m.sent_at) as last_in, count(*) as inbound
    from message_threads t
    join messages m on m.thread_id = t.id
    where t.organization_id = p_org
      and t.business_context = 'customer_service'
      and m.direction = 'inbound'
      and m.deleted_at is null
      and m.sent_at > now() - make_interval(days => p_days)
    group by t.id, t.contact_id, t.assigned_user_id
  )
  select r.id, r.contact_id, r.assigned_user_id, r.last_in
  from recent r
  where r.inbound >= 2
    and not exists (
      select 1 from service_conversation_analyses a
      where a.organization_id = p_org and a.thread_id = r.id and a.status = 'done'
    )
  order by r.last_in desc
  limit greatest(p_limit, 0);
$$;

-- Conversa inteira de cada thread, em ordem, com a transcrição mais recente de cada áudio.
-- Notas internas ficam de fora.
create or replace function public.service_analysis_messages(p_org uuid, p_thread_ids uuid[])
returns table (
  thread_id uuid, sent_at timestamptz, direction text, sender_user_id uuid, sender_agent_id uuid,
  sender_type text, media_type text, is_template boolean, content text, transcript text
)
language sql
stable
set search_path = public
as $$
  select m.thread_id, m.sent_at, m.direction, m.sender_user_id, m.sender_agent_id, m.sender_type,
         m.media_type, m.template_id is not null, m.content,
         (select a.transcript from audio_transcriptions a where a.message_id = m.id
           order by a.created_at desc limit 1)
  from messages m
  join message_threads t on t.id = m.thread_id
  where t.organization_id = p_org
    and m.thread_id = any (p_thread_ids)
    and m.direction in ('inbound', 'outbound')
    and m.deleted_at is null
    and coalesce(m.is_internal_note, false) = false
  order by m.thread_id, m.sent_at, m.id;
$$;

revoke all on function public.service_analysis_candidates(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.service_analysis_messages(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.service_analysis_candidates(uuid, integer, integer) to service_role;
grant execute on function public.service_analysis_messages(uuid, uuid[]) to service_role;
