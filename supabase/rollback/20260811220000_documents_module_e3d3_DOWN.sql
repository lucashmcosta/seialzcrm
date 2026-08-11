-- DOWN da Etapa 3d-3: remove trigger, função e tabela do snapshot de fechamento.
drop trigger if exists trg_snapshot_opportunity_close_v1 on public.opportunities;
drop function if exists public.fn_snapshot_opportunity_close_v1();
drop table if exists public.opportunity_close_snapshots;
