-- =====================================================================
-- Inbox v2 — Fase 0 (b): Índices CONCURRENTLY
-- NÃO APLICAR ainda.
-- ⚠️ NÃO pode rodar em transação. Executar comando-a-comando.
-- ⚠️ Aumentar statement_timeout se necessário: SET statement_timeout = '5min';
-- Tempo estimado: ~5s por índice em 26k linhas.
-- =====================================================================

-- Validação rápida pós-cada índice:
--   select indexname, indisvalid from pg_index i
--     join pg_class c on c.oid=i.indexrelid
--    where c.relname = '<nome_do_indice>';

set statement_timeout = '5min';

-- 1) Status + next_run_at para o dispatcher (FOR UPDATE SKIP LOCKED)
create index concurrently if not exists idx_iie_status_next_run
  on public.integration_inbound_events (process_status, next_run_at)
  where process_status in ('received','retry');

-- 2) Aggregate ordering (Twilio WaId, opportunity_id etc.)
create index concurrently if not exists idx_iie_aggregate
  on public.integration_inbound_events (integration_slug, aggregate_type, aggregate_id, sequence_number)
  where aggregate_id is not null;

-- 3) Handler key (para roteamento e métricas)
create index concurrently if not exists idx_iie_handler_key
  on public.integration_inbound_events (handler_key)
  where handler_key is not null;

-- 4) Trace correlation
create index concurrently if not exists idx_iie_trace_id
  on public.integration_inbound_events (trace_id)
  where trace_id is not null;

-- 5) Claimed/processing (reaper de stuck)
create index concurrently if not exists idx_iie_claimed_processing
  on public.integration_inbound_events (claimed_at)
  where process_status = 'processing';

-- 6) Ingest errors lookup
create index concurrently if not exists idx_iie_ingest_errors_slug_created
  on public.integration_inbound_ingest_errors (integration_slug, created_at desc);

-- 7) Dry-run analytics
create index concurrently if not exists idx_iie_dryrun_slug_outcome
  on public.integration_inbound_dry_run_log (integration_slug, outcome, created_at desc);

create index concurrently if not exists idx_iie_dryrun_event
  on public.integration_inbound_dry_run_log (inbound_event_id);

-- 8) DLA lookup
create index concurrently if not exists idx_iie_dla_slug_archived
  on public.integration_inbound_dead_letter_archive (integration_slug, archived_at desc);

-- Pós-execução: rodar validação
--   select indexrelid::regclass as indice, indisvalid, indisready
--     from pg_index
--    where indrelid in (
--      'public.integration_inbound_events'::regclass,
--      'public.integration_inbound_ingest_errors'::regclass,
--      'public.integration_inbound_dry_run_log'::regclass,
--      'public.integration_inbound_dead_letter_archive'::regclass
--    )
--      and not indisvalid;
-- (deve retornar 0 linhas)
