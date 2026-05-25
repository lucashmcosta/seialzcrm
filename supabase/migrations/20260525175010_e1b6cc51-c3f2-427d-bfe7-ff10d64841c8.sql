-- Inbox v2 — Fase 0 (a): Schema
alter table public.integration_inbound_events
  add column if not exists event_version        integer       not null default 1,
  add column if not exists trace_id             uuid,
  add column if not exists correlation_id       uuid,
  add column if not exists aggregate_type       text,
  add column if not exists aggregate_id         text,
  add column if not exists sequence_number      bigint,
  add column if not exists signature_valid      boolean,
  add column if not exists signature_algo       text,
  add column if not exists source_ip            inet,
  add column if not exists headers              jsonb,
  add column if not exists retry_count          integer       not null default 0,
  add column if not exists max_attempts         integer       not null default 8,
  add column if not exists next_run_at          timestamptz,
  add column if not exists claimed_at           timestamptz,
  add column if not exists claimed_by           text,
  add column if not exists error_classification text,
  add column if not exists dead_letter_reason   text,
  add column if not exists replay_count         integer       not null default 0,
  add column if not exists handler_key          text,
  add column if not exists shadow_mode          boolean       not null default true;

comment on column public.integration_inbound_events.event_version        is 'Inbox v2: versão do contrato do evento';
comment on column public.integration_inbound_events.trace_id             is 'Inbox v2: trace_id para correlação distribuída';
comment on column public.integration_inbound_events.aggregate_id         is 'Inbox v2: chave de ordenação (ex.: WaId, opportunity_id)';
comment on column public.integration_inbound_events.shadow_mode          is 'Inbox v2: true = não processar, apenas armazenar (Fase 1)';
comment on column public.integration_inbound_events.error_classification is 'Inbox v2: Retryable | Permanent | Conflict';

create table if not exists public.integration_inbound_handlers (
  id              uuid primary key default gen_random_uuid(),
  integration_slug text   not null,
  event_type      text   not null,
  event_version   integer not null default 1,
  handler_key     text   not null,
  requires_ordering boolean not null default false,
  max_attempts    integer not null default 8,
  is_active       boolean not null default true,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (integration_slug, event_type, event_version)
);

alter table public.integration_inbound_handlers enable row level security;
create policy "service_role_all_handlers" on public.integration_inbound_handlers
  for all to service_role using (true) with check (true);

create table if not exists public.integration_feature_flags (
  id              uuid primary key default gen_random_uuid(),
  flag_key        text not null,
  organization_id uuid,
  enabled         boolean not null default false,
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (flag_key, organization_id)
);

create unique index if not exists uniq_iff_global
  on public.integration_feature_flags (flag_key)
  where organization_id is null;

alter table public.integration_feature_flags enable row level security;
create policy "service_role_all_flags" on public.integration_feature_flags
  for all to service_role using (true) with check (true);

insert into public.integration_feature_flags (flag_key, organization_id, enabled)
values
  ('inbox_v2.ingest.suvsign',   null, false),
  ('inbox_v2.dispatch.suvsign', null, false),
  ('inbox_v2.cutover.suvsign',  null, false),
  ('inbox_v2.write.suvsign',    null, false)
on conflict do nothing;

create table if not exists public.integration_inbound_dead_letter_archive (
  id                   uuid primary key default gen_random_uuid(),
  inbound_event_id     uuid not null,
  integration_slug     text not null,
  organization_id      uuid,
  event_type           text,
  dead_letter_reason   text,
  retry_count          integer,
  raw_payload          jsonb,
  raw_headers          jsonb,
  archived_at          timestamptz not null default now(),
  archived_by          text
);

alter table public.integration_inbound_dead_letter_archive enable row level security;
create policy "service_role_all_dla" on public.integration_inbound_dead_letter_archive
  for all to service_role using (true) with check (true);

create table if not exists public.integration_inbound_dry_run_log (
  id                uuid primary key default gen_random_uuid(),
  inbound_event_id  uuid not null,
  integration_slug  text not null,
  handler_key       text,
  event_version     integer,
  intended_actions  jsonb not null,
  legacy_actual     jsonb,
  diff_summary      jsonb,
  outcome           text not null check (outcome in ('match','divergent','legacy_missing','v2_extra','error')),
  trace_id          uuid,
  created_at        timestamptz not null default now()
);

alter table public.integration_inbound_dry_run_log enable row level security;
create policy "service_role_all_dryrun" on public.integration_inbound_dry_run_log
  for all to service_role using (true) with check (true);

create table if not exists public.integration_inbound_ingest_errors (
  id              uuid primary key default gen_random_uuid(),
  trace_id        uuid,
  integration_slug text not null,
  external_id     text,
  event_type      text,
  organization_id uuid,
  error_code      text,
  error_message   text,
  created_at      timestamptz not null default now()
);

alter table public.integration_inbound_ingest_errors enable row level security;
create policy "service_role_all_ingest_errors" on public.integration_inbound_ingest_errors
  for all to service_role using (true) with check (true);