-- Leitura da agenda e das movimentações do processo pela tela.
--
-- As duas tabelas nasceram só para service_role (agente de atendimento e fila de
-- avisos). A aba Nammux da oportunidade passa a mostrar as próximas datas e as
-- últimas movimentações, então quem é da organização precisa ler — a mesma
-- regra que já vale para o retrato do processo (`nammux_process_snapshots`).
--
-- Só leitura, só `authenticated`, só a própria organização. Escrita continua
-- exclusiva do service_role (ingest). O financeiro (`nammux_process_finance`)
-- NÃO entra aqui: segue sem leitura pela tela.

grant select on public.nammux_process_events to authenticated;
grant select on public.nammux_process_movements to authenticated;

drop policy if exists "org members read Nammux process events" on public.nammux_process_events;
create policy "org members read Nammux process events"
  on public.nammux_process_events
  for select
  to authenticated
  using (public.user_has_org_access(organization_id));

drop policy if exists "org members read Nammux process movements" on public.nammux_process_movements;
create policy "org members read Nammux process movements"
  on public.nammux_process_movements
  for select
  to authenticated
  using (public.user_has_org_access(organization_id));
