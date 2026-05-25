create index if not exists idx_iie_status_next_run
  on public.integration_inbound_events (process_status, next_run_at)
  where process_status in ('received','retry');

create index if not exists idx_iie_aggregate
  on public.integration_inbound_events (integration_slug, aggregate_type, aggregate_id, sequence_number)
  where aggregate_id is not null;

create index if not exists idx_iie_handler_key
  on public.integration_inbound_events (handler_key)
  where handler_key is not null;

create index if not exists idx_iie_trace_id
  on public.integration_inbound_events (trace_id)
  where trace_id is not null;

create index if not exists idx_iie_claimed_processing
  on public.integration_inbound_events (claimed_at)
  where process_status = 'processing';

create index if not exists idx_iie_ingest_errors_slug_created
  on public.integration_inbound_ingest_errors (integration_slug, created_at desc);

create index if not exists idx_iie_dryrun_slug_outcome
  on public.integration_inbound_dry_run_log (integration_slug, outcome, created_at desc);

create index if not exists idx_iie_dryrun_event
  on public.integration_inbound_dry_run_log (inbound_event_id);

create index if not exists idx_iie_dla_slug_archived
  on public.integration_inbound_dead_letter_archive (integration_slug, archived_at desc);