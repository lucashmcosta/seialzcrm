-- Análise da conversa inteira (vale para todas as orgs).
-- A análise lê a conversa completa de cada oportunidade fechada (textos e áudios transcritos,
-- em ordem), e não mensagem por mensagem. Roda dentro da org, com a chave de IA da própria org,
-- e o resultado fica salvo aqui. Quem escreve é só a função conversation-analysis (service role).

create table if not exists public.conversation_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('conversations', 'report')),
  parent_run_id uuid references public.conversation_analysis_runs(id) on delete cascade,
  status text not null default 'preparing'
    check (status in ('preparing', 'submitted', 'done', 'failed', 'canceled')),
  provider text not null default 'anthropic',
  model text not null,
  analysis_version text not null,
  provider_batch_id text,
  params jsonb not null default '{}'::jsonb,
  budget_usd numeric(10, 2) not null check (budget_usd > 0),
  estimated_cost_usd numeric(12, 4),
  cost_usd numeric(12, 4),
  prompt_tokens bigint,
  completion_tokens bigint,
  counts jsonb,
  result jsonb,
  error text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  finished_at timestamptz
);

create index if not exists conversation_analysis_runs_org_idx
  on public.conversation_analysis_runs (organization_id, created_at desc);

create table if not exists public.conversation_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.conversation_analysis_runs(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  contact_id uuid,
  outcome text not null check (outcome in ('won', 'lost')),
  owner_user_id uuid,
  stage_before_close text,
  opened_at timestamptz,
  closed_at timestamptz,
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
  unique (run_id, opportunity_id)
);

create index if not exists conversation_analyses_org_opp_idx
  on public.conversation_analyses (organization_id, opportunity_id);

revoke all on public.conversation_analysis_runs, public.conversation_analyses from anon;
grant select on public.conversation_analysis_runs, public.conversation_analyses to authenticated;
grant all on public.conversation_analysis_runs, public.conversation_analyses to service_role;

alter table public.conversation_analysis_runs enable row level security;
alter table public.conversation_analyses enable row level security;

drop policy if exists conversation_analysis_runs_select on public.conversation_analysis_runs;
create policy conversation_analysis_runs_select on public.conversation_analysis_runs
  for select to authenticated using (organization_id = any (public.current_user_org_ids()));

drop policy if exists conversation_analyses_select on public.conversation_analyses;
create policy conversation_analyses_select on public.conversation_analyses
  for select to authenticated using (organization_id = any (public.current_user_org_ids()));

-- Amostra: oportunidades fechadas (ganhas e perdidas) com conversa de verdade, isto é, pelo menos
-- 2 mensagens do cliente e 1 resposta de uma pessoa da equipe. Uma por contato (a mais recente).
-- A ordem por md5(id || seed) dá uma amostra aleatória que se repete com a mesma seed.
create or replace function public.conversation_analysis_candidates(
  p_org uuid,
  p_days integer,
  p_won integer,
  p_lost integer,
  p_seed text
)
returns table (
  opportunity_id uuid,
  contact_id uuid,
  outcome text,
  owner_user_id uuid,
  opened_at timestamptz,
  closed_at timestamptz,
  stage_before_close text
)
language sql
stable
set search_path = public
as $$
  with opp as (
    select distinct on (p.contact_id)
      p.id, p.contact_id, p.status::text as status, p.owner_user_id, p.created_at,
      coalesce(p.won_at, p.lost_at, p.updated_at) as closed_at
    from opportunities p
    where p.organization_id = p_org
      and p.deleted_at is null
      and coalesce(p.is_sample, false) = false
      and p.contact_id is not null
      and p.status::text in ('won', 'lost')
      and p.created_at > now() - make_interval(days => p_days)
    order by p.contact_id, p.created_at desc
  ),
  -- Join agrupado: uma subconsulta por oportunidade estoura o tempo em org grande.
  counts as (
    select opp.id,
      count(*) filter (where m.direction = 'inbound') as inbound,
      count(*) filter (where m.direction = 'outbound' and m.sender_user_id is not null) as human_out
    from opp
    join message_threads t on t.organization_id = p_org and t.contact_id = opp.contact_id
    join messages m on m.thread_id = t.id
    where m.deleted_at is null
      and coalesce(m.is_internal_note, false) = false
      and m.sent_at between opp.created_at - interval '7 days' and opp.closed_at + interval '1 day'
    group by opp.id
  ),
  active as (
    select opp.* from opp join counts c on c.id = opp.id
    where c.inbound >= 2 and c.human_out >= 1
  ),
  picked as (
    (select * from active where status = 'won' order by md5(id::text || p_seed) limit greatest(p_won, 0))
    union all
    (select * from active where status = 'lost' order by md5(id::text || p_seed) limit greatest(p_lost, 0))
  )
  select
    k.id, k.contact_id, k.status, k.owner_user_id, k.created_at, k.closed_at,
    coalesce(
      (select s.name from opportunity_losses l join pipeline_stages s on s.id = l.stage_id_at_loss
        where l.opportunity_id = k.id and l.reopened_at is null order by l.created_at desc limit 1),
      (select s.name from journey_stage_history h join pipeline_stages s on s.id = h.from_stage_id
        where h.opportunity_id = k.id order by h.occurred_at desc limit 1)
    )
  from picked k;
$$;

-- Conversa completa de cada oportunidade, em ordem: de 7 dias antes de abrir até 1 dia depois de
-- fechar, com a transcrição mais recente de cada áudio. Notas internas e mensagens internas do
-- sistema ficam de fora.
create or replace function public.conversation_analysis_messages(
  p_org uuid,
  p_opportunity_ids uuid[]
)
returns table (
  opportunity_id uuid,
  sent_at timestamptz,
  direction text,
  sender_user_id uuid,
  sender_agent_id uuid,
  sender_type text,
  media_type text,
  is_template boolean,
  content text,
  transcript text
)
language sql
stable
set search_path = public
as $$
  select p.id, m.sent_at, m.direction, m.sender_user_id, m.sender_agent_id, m.sender_type,
         m.media_type, m.template_id is not null, m.content,
         (select a.transcript from audio_transcriptions a where a.message_id = m.id
           order by a.created_at desc limit 1)
  from opportunities p
  join message_threads t on t.organization_id = p_org and t.contact_id = p.contact_id
  join messages m on m.thread_id = t.id
  where p.organization_id = p_org
    and p.id = any (p_opportunity_ids)
    and m.direction in ('inbound', 'outbound')
    and m.deleted_at is null
    and coalesce(m.is_internal_note, false) = false
    and m.sent_at between p.created_at - interval '7 days'
                      and coalesce(p.won_at, p.lost_at, p.updated_at) + interval '1 day'
  order by p.id, m.sent_at, m.id;
$$;

revoke all on function public.conversation_analysis_candidates(uuid, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.conversation_analysis_messages(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.conversation_analysis_candidates(uuid, integer, integer, integer, text) to service_role;
grant execute on function public.conversation_analysis_messages(uuid, uuid[]) to service_role;
