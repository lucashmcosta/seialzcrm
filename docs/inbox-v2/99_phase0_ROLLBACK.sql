-- =====================================================================
-- Inbox v2 — Fase 0 ROLLBACK COMPLETO
-- Seguro porque nada em produção consome ainda
-- (todas feature flags = false; shadow_mode = true por default).
-- Executar somente se Fase 0 precisar ser revertida.
-- =====================================================================

-- Funções
drop function if exists public.fn_inbound_health_summary(interval);
drop function if exists public.fn_inbound_archive_dead_letter(uuid);
drop function if exists public.fn_inbound_replay(uuid);
drop function if exists public.fn_inbound_expire(interval);
drop function if exists public.fn_inbound_schedule_retry(uuid, text, text);
drop function if exists public.fn_inbound_reap_stuck(interval);
drop function if exists public.rpc_claim_inbound_events(integer, text, text);
drop function if exists public.fn_feature_flag_enabled(text, uuid);

-- Índices (fora de transação se possível)
drop index concurrently if exists public.idx_iie_status_next_run;
drop index concurrently if exists public.idx_iie_aggregate;
drop index concurrently if exists public.idx_iie_handler_key;
drop index concurrently if exists public.idx_iie_trace_id;
drop index concurrently if exists public.idx_iie_claimed_processing;
drop index concurrently if exists public.idx_iie_ingest_errors_slug_created;
drop index concurrently if exists public.idx_iie_dryrun_slug_outcome;
drop index concurrently if exists public.idx_iie_dryrun_event;
drop index concurrently if exists public.idx_iie_dla_slug_archived;
drop index concurrently if exists public.uniq_iff_global;

-- Tabelas auxiliares (não contêm dados de produção crítica)
drop table if exists public.integration_inbound_ingest_errors;
drop table if exists public.integration_inbound_dry_run_log;
drop table if exists public.integration_inbound_dead_letter_archive;
drop table if exists public.integration_feature_flags;
drop table if exists public.integration_inbound_handlers;

-- Colunas adicionadas (rápido em PG17, default constante)
alter table public.integration_inbound_events
  drop column if exists shadow_mode,
  drop column if exists handler_key,
  drop column if exists replay_count,
  drop column if exists dead_letter_reason,
  drop column if exists error_classification,
  drop column if exists claimed_by,
  drop column if exists claimed_at,
  drop column if exists next_run_at,
  drop column if exists max_attempts,
  drop column if exists retry_count,
  drop column if exists headers,
  drop column if exists source_ip,
  drop column if exists signature_algo,
  drop column if exists signature_valid,
  drop column if exists sequence_number,
  drop column if exists aggregate_id,
  drop column if exists aggregate_type,
  drop column if exists correlation_id,
  drop column if exists trace_id,
  drop column if exists event_version;
