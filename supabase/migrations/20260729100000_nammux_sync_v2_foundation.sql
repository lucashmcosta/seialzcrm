-- Nammux integration v2: tenant credentials, contact events and local process projection.

create table if not exists public.nammux_integration_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key_id text not null,
  secret_ciphertext text not null,
  is_active boolean not null default true,
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  rotated_from_key_id text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nammux_integration_credentials_key_unique unique (organization_id, key_id),
  constraint nammux_integration_credentials_expiry_check
    check (expires_at is null or expires_at > valid_from)
);

create index if not exists idx_nammux_integration_credentials_active
  on public.nammux_integration_credentials (organization_id, is_active, valid_from desc);

alter table public.nammux_integration_credentials enable row level security;
revoke all on public.nammux_integration_credentials from public, anon, authenticated;
grant all on public.nammux_integration_credentials to service_role;

create trigger trg_nammux_integration_credentials_updated
before update on public.nammux_integration_credentials
for each row execute function public.update_updated_at_column();

create table if not exists public.nammux_process_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  external_process_id text not null,
  external_contact_id text,
  process_title text,
  cnj text,
  internal_number text,
  phase text,
  stage_id text,
  stage_name text,
  status_id text,
  status_name text,
  area_id text,
  area_name text,
  responsible_user_id text,
  responsible_name text,
  distributed_at date,
  external_url text,
  sync_status text not null default 'synced'
    check (sync_status in ('pending', 'synced', 'conflict', 'error')),
  last_event_id text,
  last_error text,
  source_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nammux_process_snapshots_opportunity_unique
    unique (organization_id, opportunity_id),
  constraint nammux_process_snapshots_process_unique
    unique (organization_id, external_process_id)
);

create index if not exists idx_nammux_process_snapshots_org_sync
  on public.nammux_process_snapshots (organization_id, sync_status, last_synced_at desc);

create table if not exists public.nammux_sync_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  external_event_id text not null,
  event_type text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null check (status in ('received', 'processed', 'pending', 'success', 'error', 'conflict')),
  summary jsonb not null default '{}'::jsonb,
  error text,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  constraint nammux_sync_events_external_unique
    unique (organization_id, direction, external_event_id)
);

create index if not exists idx_nammux_sync_events_opportunity
  on public.nammux_sync_events (organization_id, opportunity_id, created_at desc);

alter table public.nammux_process_snapshots enable row level security;
alter table public.nammux_sync_events enable row level security;

create trigger trg_nammux_process_snapshots_updated
before update on public.nammux_process_snapshots
for each row execute function public.update_updated_at_column();

create policy "org members read Nammux process snapshots"
  on public.nammux_process_snapshots for select to authenticated
  using (public.user_has_org_access(organization_id));
create policy "org members read Nammux sync events"
  on public.nammux_sync_events for select to authenticated
  using (public.user_has_org_access(organization_id));

grant select on public.nammux_process_snapshots, public.nammux_sync_events to authenticated;
grant all on public.nammux_process_snapshots, public.nammux_sync_events to service_role;

alter table public.external_mappings
  drop constraint if exists external_mappings_internal_unique,
  drop constraint if exists external_mappings_external_unique;
drop index if exists public.external_mappings_internal_unique;
drop index if exists public.external_mappings_external_unique;
alter table public.external_mappings
  add constraint external_mappings_internal_unique
    unique (organization_id, integration_slug, entity_type, internal_id),
  add constraint external_mappings_external_unique
    unique (organization_id, integration_slug, entity_type, external_id);

-- Legacy browser-readable secrets are no longer returned as integration configuration.
update public.organization_integrations oi
set config_values = coalesce(oi.config_values, '{}'::jsonb) - 'webhook_secret',
    updated_at = now()
where exists (
  select 1 from public.admin_integrations ai
  where ai.id = oi.integration_id and ai.slug = 'nammux'
)
and coalesce(oi.config_values, '{}'::jsonb) ? 'webhook_secret';

create or replace function public.fn_build_nammux_contact_payload(_contact_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ct as (
    select c.* from public.contacts c where c.id = _contact_id and c.deleted_at is null
  ),
  cfg as (
    select coalesce(oi.config_values->'contact_field_mapping', '{}'::jsonb) mapping
    from public.organization_integrations oi
    join public.admin_integrations ai on ai.id = oi.integration_id and ai.slug = 'nammux'
    join ct on ct.organization_id = oi.organization_id
    where oi.is_enabled = true
    limit 1
  ),
  mapped as (
    select coalesce(jsonb_object_agg(mapping.target_name, cfv.value), '{}'::jsonb) values
    from cfg
    cross join lateral jsonb_each_text(cfg.mapping) mapping(source_name, target_name)
    join ct on true
    join public.custom_field_definitions cfd
      on cfd.organization_id = ct.organization_id
     and cfd.name = mapping.source_name
     and cfd.module in ('contact', 'contacts')
    join public.custom_field_values cfv
      on cfv.organization_id = ct.organization_id
     and cfv.record_id = ct.id
     and cfv.field_definition_id = cfd.id
  )
  select jsonb_build_object(
    'id', ct.id,
    'full_name', ct.full_name,
    'first_name', ct.first_name,
    'last_name', ct.last_name,
    'email', ct.email,
    'phone', ct.phone,
    'cpf', ct.cpf,
    'rg', ct.rg,
    'rg_issuer', ct.rg_issuer,
    'nationality', ct.nationality,
    'address_street', ct.address_street,
    'address_neighborhood', ct.address_neighborhood,
    'address_city', ct.address_city,
    'address_state', ct.address_state,
    'address_zip', ct.address_zip,
    'company_name', ct.company_name,
    'mapped_custom_fields', coalesce(mapped.values, '{}'::jsonb)
  )
  from ct
  left join mapped on true;
$$;

create or replace function public.fn_build_opportunity_won_payload(_opportunity_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with op as (
    select o.* from public.opportunities o where o.id = _opportunity_id
  ),
  contact_payload as (
    select public.fn_build_nammux_contact_payload(op.contact_id) value from op
  ),
  att as (
    select distinct on (a.id)
      a.id, a.entity_type, a.entity_id, a.bucket, a.storage_path,
      a.file_name, a.mime_type, a.size_bytes, a.uploaded_by_user_id, a.created_at
    from public.attachments a, op
    where a.deleted_at is null
      and (
        (a.entity_type = 'opportunity' and a.entity_id = op.id)
        or (a.entity_type = 'contact' and a.entity_id = op.contact_id)
      )
  ),
  subs as (
    select
      ds.id, ds.status, ds.document_type_id, ds.attachment_id,
      dt.code as document_type_code, dt.name as document_type_name,
      a.file_name, a.mime_type, a.size_bytes, a.bucket, a.storage_path
    from public.document_submissions ds
    join op on op.contact_id = ds.contact_id
    join public.document_types dt on dt.id = ds.document_type_id
    join public.attachments a on a.id = ds.attachment_id and a.deleted_at is null
    where ds.status = 'approved' and ds.deleted_at is null
  )
  select jsonb_build_object(
    'schema_version', 2,
    'event_version', '2.0',
    'source', 'seialz_crm',
    'organization_id', op.organization_id,
    'opportunity', jsonb_build_object(
      'id', op.id,
      'title', op.title,
      'amount', op.amount,
      'currency', op.currency,
      'status', op.status,
      'pipeline_stage_id', op.pipeline_stage_id,
      'close_date', op.close_date,
      'owner_user_id', op.owner_user_id
    ),
    'contact', contact_payload.value,
    'attachments', coalesce((select jsonb_agg(to_jsonb(att.*) order by att.created_at) from att), '[]'::jsonb),
    'document_submissions', coalesce((select jsonb_agg(to_jsonb(subs.*)) from subs), '[]'::jsonb)
  )
  from op, contact_payload;
$$;

create or replace function public.fn_emit_nammux_contact_updated(_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contacts%rowtype;
  v_payload jsonb;
  v_idempotency text;
begin
  select * into v_contact
  from public.contacts
  where id = _contact_id and deleted_at is null;
  if v_contact.id is null then return; end if;

  if not exists (
    select 1
    from public.opportunities o
    where o.organization_id = v_contact.organization_id
      and o.contact_id = v_contact.id
      and o.status = 'won'
      and o.deleted_at is null
      and (
        exists (
          select 1 from public.external_mappings em
          where em.organization_id = o.organization_id
            and em.integration_slug = 'nammux'
            and em.entity_type = 'opportunity'
            and em.internal_id = o.id
        )
        or exists (
          select 1
          from public.integration_events ie
          join public.integration_jobs ij on ij.event_id = ie.id
          where ie.organization_id = o.organization_id
            and ie.aggregate_id = o.id
            and ie.event_type = 'opportunity.won'
            and ij.integration_slug = 'nammux'
            and ij.status = 'success'
        )
      )
  ) then
    return;
  end if;

  v_payload := jsonb_build_object(
    'schema_version', 1,
    'source', 'seialz_crm',
    'organization_id', v_contact.organization_id,
    'contact', public.fn_build_nammux_contact_payload(v_contact.id)
  );
  v_idempotency := 'seialz:contact.updated:' || v_contact.organization_id::text || ':' ||
    v_contact.id::text || ':' || gen_random_uuid()::text;

  insert into public.integration_events (
    organization_id, aggregate_type, aggregate_id, event_type,
    payload, idempotency_key, occurred_at, status
  ) values (
    v_contact.organization_id, 'contact', v_contact.id, 'contact.updated',
    v_payload, v_idempotency, now(), 'pending'
  );
end;
$$;

create or replace function public.fn_emit_nammux_contact_updated_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_emit_nammux_contact_updated(new.id);
  return new;
end;
$$;

drop trigger if exists trg_emit_nammux_contact_updated on public.contacts;
create trigger trg_emit_nammux_contact_updated
after update of full_name, first_name, last_name, email, phone, cpf, rg,
  nationality, address_street, address_neighborhood, address_city,
  address_state, address_zip
on public.contacts
for each row execute function public.fn_emit_nammux_contact_updated_trigger();

create or replace function public.fn_emit_nammux_custom_contact_updated_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid := coalesce(new.record_id, old.record_id);
  v_module text := coalesce(new.module, old.module);
begin
  if v_module in ('contact', 'contacts') then
    perform public.fn_emit_nammux_contact_updated(v_record_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_emit_nammux_custom_contact_updated on public.custom_field_values;
create trigger trg_emit_nammux_custom_contact_updated
after insert or update or delete on public.custom_field_values
for each row execute function public.fn_emit_nammux_custom_contact_updated_trigger();

update public.admin_integrations
set description = 'Sincronização segura e multi-tenant entre oportunidades do Seialz e processos do Nammux.',
    config_schema = jsonb_build_object(
      'fields', jsonb_build_array(
        jsonb_build_object('key','webhook_url','label','Webhook URL','type','string','required',true),
        jsonb_build_object('key','enabled','label','Ativar integração','type','boolean','default',true),
        jsonb_build_object('key','send_opportunity_won','label','Enviar opportunity.won','type','boolean','default',true),
        jsonb_build_object('key','contact_field_mapping','label','Mapeamento de campos','type','json','default','{}'::jsonb)
      )
    ),
    updated_at = now()
where slug = 'nammux';

create or replace function public.fn_sync_nammux_subscription(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := false;
  v_send_won boolean := false;
  v_has_credential boolean := false;
  v_cfg jsonb := '{}'::jsonb;
begin
  select
    oi.is_enabled
      and coalesce((oi.config_values->>'enabled')::boolean, true),
    coalesce((oi.config_values->>'send_opportunity_won')::boolean, true),
    coalesce(oi.config_values, '{}'::jsonb)
  into v_enabled, v_send_won, v_cfg
  from public.organization_integrations oi
  join public.admin_integrations ai on ai.id = oi.integration_id
  where oi.organization_id = p_org_id and ai.slug = 'nammux'
  limit 1;

  select exists (
    select 1
    from public.nammux_integration_credentials c
    where c.organization_id = p_org_id
      and c.is_active
      and c.valid_from <= now()
      and (c.expires_at is null or c.expires_at > now())
  ) into v_has_credential;

  v_enabled := coalesce(v_enabled, false)
    and v_has_credential
    and nullif(btrim(v_cfg->>'webhook_url'), '') is not null;

  insert into public.integration_subscriptions (
    organization_id, integration_slug, event_type, target_action, is_active, config
  ) values
    (p_org_id, 'nammux', 'opportunity.won', 'send_opportunity_won', v_enabled and v_send_won, '{}'::jsonb),
    (p_org_id, 'nammux', 'contact.updated', 'send_contact_updated', v_enabled and v_send_won, '{}'::jsonb)
  on conflict (organization_id, integration_slug, event_type, target_action)
  do update set
    is_active = excluded.is_active,
    paused_until = null;
end;
$$;

do $$
declare
  v_org record;
begin
  for v_org in
    select distinct oi.organization_id
    from public.organization_integrations oi
    join public.admin_integrations ai on ai.id = oi.integration_id
    where ai.slug = 'nammux' and oi.organization_id is not null
  loop
    perform public.fn_sync_nammux_subscription(v_org.organization_id);
  end loop;
end;
$$;

create or replace function public.fn_track_nammux_outbound_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.integration_events%rowtype;
  v_opportunity_id uuid;
  v_status text;
begin
  if new.integration_slug <> 'nammux' then return new; end if;
  select * into v_event from public.integration_events where id = new.event_id;
  if v_event.id is null then return new; end if;
  if v_event.aggregate_type = 'opportunity' then
    v_opportunity_id := v_event.aggregate_id;
  end if;
  v_status := case
    when new.status = 'success' then 'success'
    when new.status in ('failed', 'dead_letter') then 'error'
    else 'pending'
  end;

  insert into public.nammux_sync_events (
    organization_id, opportunity_id, external_event_id, event_type,
    direction, status, summary, error, occurred_at
  ) values (
    new.organization_id, v_opportunity_id, v_event.id::text, v_event.event_type,
    'outbound', v_status,
    jsonb_build_object(
      'job_id', new.id,
      'target_action', new.target_action,
      'attempts', new.attempts
    ),
    new.last_error,
    v_event.occurred_at
  )
  on conflict (organization_id, direction, external_event_id)
  do update set
    status = excluded.status,
    summary = excluded.summary,
    error = excluded.error;
  return new;
end;
$$;

drop trigger if exists trg_track_nammux_outbound_job on public.integration_jobs;
create trigger trg_track_nammux_outbound_job
after insert or update
on public.integration_jobs
for each row execute function public.fn_track_nammux_outbound_job();
