-- Complete contact addresses and safely accept address updates from Nammux.

alter table public.contacts
  add column if not exists address_number text,
  add column if not exists address_complement text;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'contacts'
  ) then
    alter publication supabase_realtime add table public.contacts;
  end if;
end;
$$;

create table if not exists public.nammux_contact_address_state (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  source_updated_at timestamptz,
  last_event_id text,
  last_synced_at timestamptz not null default now(),
  primary key (organization_id, contact_id)
);

alter table public.nammux_contact_address_state enable row level security;
revoke all on public.nammux_contact_address_state from public, anon, authenticated;
grant all on public.nammux_contact_address_state to service_role;

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
    'address_number', ct.address_number,
    'address_complement', ct.address_complement,
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

create or replace function public.fn_emit_nammux_contact_updated_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- An address received from Nammux must not be echoed back to Nammux.
  if current_setting('app.nammux_contact_inbound', true) = '1' then
    return new;
  end if;

  perform public.fn_emit_nammux_contact_updated(new.id);
  return new;
end;
$$;

drop trigger if exists trg_emit_nammux_contact_updated on public.contacts;
create trigger trg_emit_nammux_contact_updated
after update of full_name, first_name, last_name, email, phone, cpf, rg,
  nationality, address_street, address_number, address_complement,
  address_neighborhood, address_city, address_state, address_zip
on public.contacts
for each row execute function public.fn_emit_nammux_contact_updated_trigger();

create or replace function public.apply_nammux_contact_address(
  _organization_id uuid,
  _contact_id uuid,
  _address jsonb,
  _source_event_id text,
  _source_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opportunity_id uuid;
  v_current_source_updated_at timestamptz;
  v_effective_source_updated_at timestamptz := coalesce(_source_updated_at, now());
begin
  select o.id into v_opportunity_id
  from public.opportunities o
  join public.nammux_process_snapshots snapshot
    on snapshot.organization_id = o.organization_id
   and snapshot.opportunity_id = o.id
  where o.organization_id = _organization_id
    and o.contact_id = _contact_id
    and o.deleted_at is null
  order by snapshot.last_synced_at desc
  limit 1;

  if v_opportunity_id is null then
    raise exception 'NAMMUX_CONTACT_NOT_LINKED: %', _contact_id;
  end if;

  select source_updated_at into v_current_source_updated_at
  from public.nammux_contact_address_state
  where organization_id = _organization_id
    and contact_id = _contact_id
  for update;

  if v_current_source_updated_at is not null
     and v_effective_source_updated_at < v_current_source_updated_at then
    return jsonb_build_object(
      'contact_id', _contact_id,
      'opportunity_id', v_opportunity_id,
      'ignored_as_stale', true
    );
  end if;

  perform set_config('app.nammux_contact_inbound', '1', true);

  update public.contacts
  set
    address_street = coalesce(
      nullif(btrim(_address->>'street'), ''),
      address_street
    ),
    address_number = coalesce(
      nullif(btrim(_address->>'number'), ''),
      address_number
    ),
    address_complement = coalesce(
      nullif(btrim(_address->>'complement'), ''),
      address_complement
    ),
    address_neighborhood = coalesce(
      nullif(btrim(_address->>'neighborhood'), ''),
      address_neighborhood
    ),
    address_city = coalesce(
      nullif(btrim(_address->>'city'), ''),
      address_city
    ),
    address_state = coalesce(
      nullif(btrim(_address->>'state'), ''),
      address_state
    ),
    address_zip = coalesce(
      nullif(btrim(_address->>'zip'), ''),
      address_zip
    ),
    updated_at = now()
  where id = _contact_id
    and organization_id = _organization_id
    and deleted_at is null;

  if not found then
    raise exception 'NAMMUX_CONTACT_NOT_FOUND: %', _contact_id;
  end if;

  insert into public.nammux_contact_address_state (
    organization_id,
    contact_id,
    source_updated_at,
    last_event_id,
    last_synced_at
  ) values (
    _organization_id,
    _contact_id,
    v_effective_source_updated_at,
    _source_event_id,
    now()
  )
  on conflict (organization_id, contact_id) do update
  set
    source_updated_at = excluded.source_updated_at,
    last_event_id = excluded.last_event_id,
    last_synced_at = excluded.last_synced_at;

  return jsonb_build_object(
    'contact_id', _contact_id,
    'opportunity_id', v_opportunity_id,
    'ignored_as_stale', false
  );
end;
$$;

revoke all on function public.apply_nammux_contact_address(
  uuid, uuid, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_nammux_contact_address(
  uuid, uuid, jsonb, text, timestamptz
) to service_role;
