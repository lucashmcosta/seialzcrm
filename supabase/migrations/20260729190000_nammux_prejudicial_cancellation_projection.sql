-- Estado jurídico/operacional do Nammux permanece separado do status comercial
-- e da etapa do funil da oportunidade.

alter table public.nammux_process_snapshots
  add column if not exists status_code text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_change_reason text,
  add column if not exists status_changed_by_name text;

create index if not exists idx_nammux_process_snapshots_prejudicial_cancelled
  on public.nammux_process_snapshots (organization_id, last_synced_at desc)
  where phase = 'PRE_JUDICIAL' and status_code = 'CANCELADO';

comment on column public.nammux_process_snapshots.status_code is
  'Código do estado operacional/jurídico no Nammux; não altera opportunities.status.';
