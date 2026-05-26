
-- ============================================================
-- SEIALZ INTELLIGENCE — Schema MVP
-- ============================================================

-- ---------- 1. intelligence_settings ----------
create table if not exists public.intelligence_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  capture jsonb not null default jsonb_build_object(
    'whatsapp', true,
    'inbound', true,
    'outbound', true,
    'only_open_deals', true,
    'ignore_internal_notes', true
  ),
  transcription jsonb not null default jsonb_build_object(
    'mode', 'all_whatsapp',
    'include_lead_audio', true,
    'include_seller_audio', true,
    'max_audio_seconds', 600
  ),
  behavior jsonb not null default jsonb_build_object(
    'detect_objection', true,
    'detect_buying_signal', true,
    'detect_ghosting', true,
    'detect_premature_lost', true,
    'min_cadence_before_lost', jsonb_build_object('messages', 3, 'days', 5),
    'ghosting_threshold_days', 4
  ),
  privacy jsonb not null default jsonb_build_object(
    'transcription_retention_days', 180,
    'org_opt_out', false
  ),
  version integer not null default 1,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.intelligence_settings enable row level security;

create policy "intelligence_settings_select_org"
  on public.intelligence_settings for select to authenticated
  using (organization_id = any(public.current_user_org_ids()));

create policy "intelligence_settings_update_admin"
  on public.intelligence_settings for update to authenticated
  using (organization_id = any(public.current_user_org_ids()))
  with check (organization_id = any(public.current_user_org_ids()));

create policy "intelligence_settings_insert_admin"
  on public.intelligence_settings for insert to authenticated
  with check (organization_id = any(public.current_user_org_ids()));

create trigger trg_intelligence_settings_updated_at
  before update on public.intelligence_settings
  for each row execute function public.update_updated_at_column();

-- Seed defaults for existing orgs
insert into public.intelligence_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- Auto-create for new orgs
create or replace function public.create_intelligence_settings_for_new_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.intelligence_settings (organization_id) values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_org_intelligence_settings on public.organizations;
create trigger trg_org_intelligence_settings
  after insert on public.organizations
  for each row execute function public.create_intelligence_settings_for_new_org();

-- ---------- 2. intelligence_settings_audit ----------
create table if not exists public.intelligence_settings_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  changed_by uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_is_audit_org_created on public.intelligence_settings_audit(organization_id, created_at desc);

alter table public.intelligence_settings_audit enable row level security;
create policy "is_audit_select_org" on public.intelligence_settings_audit
  for select to authenticated
  using (organization_id = any(public.current_user_org_ids()));

create or replace function public.intelligence_settings_audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.intelligence_settings_audit(organization_id, changed_by, before, after)
  values (
    new.organization_id,
    new.updated_by,
    to_jsonb(old),
    to_jsonb(new)
  );
  return new;
end;
$$;
drop trigger if exists trg_intelligence_settings_audit on public.intelligence_settings;
create trigger trg_intelligence_settings_audit
  after update on public.intelligence_settings
  for each row execute function public.intelligence_settings_audit_trigger();

-- ---------- 3. message_response_times ----------
create table if not exists public.message_response_times (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  thread_id uuid not null,
  opportunity_id uuid,
  user_id uuid,
  contact_id uuid,
  inbound_message_id uuid not null,
  outbound_message_id uuid not null unique,
  inbound_at timestamptz not null,
  outbound_at timestamptz not null,
  response_seconds integer not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_mrt_org_user_out on public.message_response_times(organization_id, user_id, outbound_at desc);
create index if not exists idx_mrt_opportunity on public.message_response_times(opportunity_id);

alter table public.message_response_times enable row level security;
create policy "mrt_select_org" on public.message_response_times
  for select to authenticated
  using (organization_id = any(public.current_user_org_ids()));

-- Trigger: ao inserir outbound, calcula tempo desde último inbound não respondido no thread
create or replace function public.fn_calc_message_response_time()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_last_inbound record;
begin
  if new.direction is distinct from 'outbound' then
    return new;
  end if;
  if new.is_sample is true then return new; end if;

  -- Busca último inbound do thread ainda sem outbound emparelhado depois dele
  select m.id, m.sent_at, m.created_at, t.contact_id, t.opportunity_id
    into v_last_inbound
  from public.messages m
  join public.message_threads t on t.id = m.thread_id
  where m.thread_id = new.thread_id
    and m.direction = 'inbound'
    and coalesce(m.is_sample, false) = false
    and coalesce(m.sent_at, m.created_at) < coalesce(new.sent_at, new.created_at, now())
    and not exists (
      select 1 from public.messages m2
      where m2.thread_id = new.thread_id
        and m2.direction = 'outbound'
        and m2.id <> new.id
        and coalesce(m2.sent_at, m2.created_at) > coalesce(m.sent_at, m.created_at)
        and coalesce(m2.sent_at, m2.created_at) < coalesce(new.sent_at, new.created_at, now())
    )
  order by coalesce(m.sent_at, m.created_at) desc
  limit 1;

  if v_last_inbound.id is null then
    return new;
  end if;

  insert into public.message_response_times(
    organization_id, thread_id, opportunity_id, user_id, contact_id,
    inbound_message_id, outbound_message_id, inbound_at, outbound_at, response_seconds
  ) values (
    new.organization_id,
    new.thread_id,
    v_last_inbound.opportunity_id,
    new.sender_user_id,
    v_last_inbound.contact_id,
    v_last_inbound.id,
    new.id,
    coalesce(v_last_inbound.sent_at, v_last_inbound.created_at),
    coalesce(new.sent_at, new.created_at, now()),
    greatest(0, extract(epoch from (coalesce(new.sent_at, new.created_at, now()) - coalesce(v_last_inbound.sent_at, v_last_inbound.created_at)))::int)
  )
  on conflict (outbound_message_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_calc_message_response_time on public.messages;
create trigger trg_calc_message_response_time
  after insert on public.messages
  for each row execute function public.fn_calc_message_response_time();

-- ---------- 4. opportunity_behavior_snapshot ----------
create table if not exists public.opportunity_behavior_snapshot (
  opportunity_id uuid primary key references public.opportunities(id) on delete cascade,
  organization_id uuid not null,
  contact_id uuid,
  user_id uuid,
  final_status text,
  total_messages_inbound integer not null default 0,
  total_messages_outbound integer not null default 0,
  audios_inbound integer not null default 0,
  audios_outbound integer not null default 0,
  documents_sent integer not null default 0,
  first_response_seconds integer,
  avg_lead_response_seconds integer,
  avg_seller_response_seconds integer,
  asked_price boolean not null default false,
  asked_deadline boolean not null default false,
  sent_documents boolean not null default false,
  objections_count integer not null default 0,
  buying_signals_count integer not null default 0,
  hours_distribution jsonb not null default '{}'::jsonb,
  days_to_close integer,
  days_to_ghost integer,
  ghosted_after_stage text,
  lost_reason text,
  lost_at timestamptz,
  won_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists idx_obs_org_status on public.opportunity_behavior_snapshot(organization_id, final_status);
create index if not exists idx_obs_user on public.opportunity_behavior_snapshot(user_id);

alter table public.opportunity_behavior_snapshot enable row level security;
create policy "obs_select_org" on public.opportunity_behavior_snapshot
  for select to authenticated
  using (organization_id = any(public.current_user_org_ids()));

-- ---------- 5. seller_metrics_daily ----------
create table if not exists public.seller_metrics_daily (
  organization_id uuid not null,
  user_id uuid not null,
  day date not null,
  messages_sent integer not null default 0,
  messages_received integer not null default 0,
  audios_sent integer not null default 0,
  audios_received integer not null default 0,
  avg_response_seconds integer,
  median_response_seconds integer,
  follow_ups_count integer not null default 0,
  leads_touched integer not null default 0,
  leads_lost integer not null default 0,
  leads_won integer not null default 0,
  avg_messages_per_lost integer,
  avg_days_before_lost integer,
  hot_leads_abandoned integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, day)
);
create index if not exists idx_smd_org_day on public.seller_metrics_daily(organization_id, day desc);

alter table public.seller_metrics_daily enable row level security;
create policy "smd_select_org" on public.seller_metrics_daily
  for select to authenticated
  using (organization_id = any(public.current_user_org_ids()));

-- ---------- 6. sales_events índices novos ----------
create index if not exists idx_sales_events_org_type_at on public.sales_events(organization_id, event_type, occurred_at desc);
create index if not exists idx_sales_events_opp_type on public.sales_events(opportunity_id, event_type);
create index if not exists idx_sales_events_user_at on public.sales_events(user_id, occurred_at desc);

-- ---------- 7. helpers/comments ----------
comment on table public.intelligence_settings is 'Seialz Intelligence settings per organization (MVP)';
comment on table public.opportunity_behavior_snapshot is 'Aggregated behavioral metrics per opportunity for won/lost comparisons';
comment on table public.seller_metrics_daily is 'Daily aggregated seller performance metrics';
comment on table public.message_response_times is 'Pairs each outbound message with the prior unanswered inbound to track response time';
