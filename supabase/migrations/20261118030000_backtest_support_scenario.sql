-- Teste do agente de atendimento (agent-backtest, cenário 'support'): conversas recentes da tela de
-- atendimento, comparando a resposta do agente com a da equipe. Vale para todas as orgs.
alter table public.agent_backtest_runs drop constraint if exists agent_backtest_runs_scenario_check;
alter table public.agent_backtest_runs add constraint agent_backtest_runs_scenario_check
  check (scenario in ('labor_calc', 'support'));
