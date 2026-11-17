-- Teste do agente com conversas antigas (vale para todas as orgs).
-- A função agent-backtest repassa conversas reais ao agente em modo de teste (nada vai ao
-- cliente), compara com o que a equipe fez e grava aqui. Roda dentro da org, com a chave de IA
-- da própria org. Quem escreve é só a função (service role).

create table if not exists public.agent_backtest_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  scenario text not null check (scenario in ('labor_calc')),
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  params jsonb not null default '{}'::jsonb,
  budget_usd numeric(10, 2) not null check (budget_usd > 0),
  estimated_cost_usd numeric(12, 4),
  cost_usd numeric(12, 4),
  counts jsonb,
  cases jsonb not null default '[]'::jsonb,
  error text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists agent_backtest_runs_org_idx
  on public.agent_backtest_runs (organization_id, created_at desc);

revoke all on public.agent_backtest_runs from anon;
grant select on public.agent_backtest_runs to authenticated;
grant all on public.agent_backtest_runs to service_role;

alter table public.agent_backtest_runs enable row level security;

drop policy if exists agent_backtest_runs_select on public.agent_backtest_runs;
create policy agent_backtest_runs_select on public.agent_backtest_runs
  for select to authenticated using (organization_id = any (public.current_user_org_ids()));
