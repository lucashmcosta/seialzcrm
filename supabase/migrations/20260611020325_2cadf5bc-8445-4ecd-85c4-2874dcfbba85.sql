
-- =====================================================================
-- Inbox v2 — Fase 2 read-only parity dispatcher
-- =====================================================================

-- 1) Tabela leve de claims (1 linha por (event, handler) ativo)
create table if not exists public.integration_inbound_event_claims (
  inbound_event_id uuid        not null,
  handler_key      text        not null,
  claimed_at       timestamptz not null default now(),
  claimed_by       text,
  expires_at       timestamptz not null default now() + interval '5 minutes',
  primary key (inbound_event_id, handler_key)
);

grant select, insert, update, delete on public.integration_inbound_event_claims to service_role;

alter table public.integration_inbound_event_claims enable row level security;

create policy "service_role_all_claims"
  on public.integration_inbound_event_claims
  for all to service_role using (true) with check (true);

create index if not exists idx_iiec_expires
  on public.integration_inbound_event_claims (expires_at);

comment on table public.integration_inbound_event_claims is
  'Inbox v2: claim leve por (inbound_event_id, handler_key). PK garante atomicidade do claim. expires_at permite auto-recovery se o worker morrer.';

-- 2) Índice único no dry_run_log (permite replay via DELETE)
create unique index if not exists uniq_iidrl_event_handler
  on public.integration_inbound_dry_run_log (inbound_event_id, handler_key);

-- 3) Índice de suporte ao claim shadow
create index if not exists idx_iie_shadow_received
  on public.integration_inbound_events (integration_slug, received_at)
  where shadow_mode = true and process_status = 'received';

-- 4) RPC de claim atômico (read-only sobre events; insere apenas em claims)
create or replace function public.rpc_claim_inbound_shadow_events(
  _batch_size       integer  default 25,
  _integration_slug text     default 'twilio-whatsapp',
  _handler_key      text     default 'twilio.whatsapp.parity_check.v1',
  _worker_id        text     default null,
  _claim_ttl        interval default interval '5 minutes'
) returns setof public.integration_inbound_events
language sql
security definer
set search_path = public
as $$
  with eligible as (
    select e.id
      from public.integration_inbound_events e
     where e.shadow_mode = true
       and e.process_status = 'received'
       and e.integration_slug = _integration_slug
       and not exists (
         select 1 from public.integration_inbound_dry_run_log l
          where l.inbound_event_id = e.id
            and l.handler_key      = _handler_key
       )
       and not exists (
         select 1 from public.integration_inbound_event_claims c
          where c.inbound_event_id = e.id
            and c.handler_key      = _handler_key
            and c.expires_at       > now()
       )
     order by e.received_at asc
     limit greatest(1, least(_batch_size, 200))
  ),
  inserted as (
    insert into public.integration_inbound_event_claims
      (inbound_event_id, handler_key, claimed_by, expires_at)
    select id,
           _handler_key,
           coalesce(_worker_id, 'dispatcher-' || gen_random_uuid()::text),
           now() + _claim_ttl
      from eligible
    on conflict (inbound_event_id, handler_key) do nothing
    returning inbound_event_id
  )
  select e.*
    from public.integration_inbound_events e
    join inserted i on i.inbound_event_id = e.id;
$$;

revoke all on function public.rpc_claim_inbound_shadow_events(integer, text, text, text, interval) from public;
grant execute on function public.rpc_claim_inbound_shadow_events(integer, text, text, text, interval) to service_role;

comment on function public.rpc_claim_inbound_shadow_events(integer, text, text, text, interval) is
  'Inbox v2 Fase 2: claim atômico via INSERT ON CONFLICT DO NOTHING RETURNING no integration_inbound_event_claims. NÃO altera process_status dos eventos shadow. Dois workers concorrentes nunca recebem o mesmo evento.';

-- 5) Feature flag (default OFF)
insert into public.integration_feature_flags (flag_key, organization_id, enabled)
values ('inbox_v2.dispatch.twilio-whatsapp', null, false)
on conflict do nothing;

-- 6) Handler registrado (esquema atual só tem is_active, não enabled/shadow_supported)
insert into public.integration_inbound_handlers
  (integration_slug, event_type, event_version, handler_key,
   requires_ordering, max_attempts, is_active, description)
values
  ('twilio-whatsapp', 'inbound_message', 1, 'twilio.whatsapp.parity_check.v1',
   false, 1, true,
   'Read-only parity check between shadow inbound event and legacy WhatsApp messages')
on conflict (integration_slug, event_type, event_version) do nothing;
