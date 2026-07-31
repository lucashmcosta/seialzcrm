-- Organization-scoped opportunity closing requirements and a normalized
-- read model for the existing attachments/document_submissions layers.

begin;

alter table public.contact_identity_profiles
  add column if not exists last_verification_attempt_at timestamptz,
  add column if not exists last_failure_class text,
  add column if not exists last_provider_http_status integer,
  add column if not exists last_attempt_retryable boolean not null default false;

alter table public.contact_identity_profiles
  drop constraint if exists contact_identity_profiles_failure_class_check;
alter table public.contact_identity_profiles
  add constraint contact_identity_profiles_failure_class_check
  check (last_failure_class is null or last_failure_class in (
    'provider_unavailable', 'not_found', 'invalid', 'auth', 'configuration', 'unknown'
  ));

create or replace function public.fn_reset_cpf_verification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.cpf is distinct from old.cpf then
    insert into public.contact_identity_profiles (
      organization_id, contact_id, cpf_verification_status, updated_at
    ) values (new.organization_id, new.id, 'unverified', now())
    on conflict (contact_id) do update set
      cpf_verification_status = 'unverified',
      cpf_registration_status = null,
      birth_date = null,
      sex = null,
      mother_name = null,
      verification_provider = null,
      verification_provider_version = null,
      cpf_verified_at = null,
      last_error_code = null,
      last_verification_attempt_at = null,
      last_failure_class = null,
      last_provider_http_status = null,
      last_attempt_retryable = false,
      updated_at = now();
  end if;
  return new;
end;
$$;

create table if not exists public.opportunity_close_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  mode text not null default 'off' check (mode in ('off', 'monitor', 'enforce')),
  require_cpf_verified boolean not null default false,
  require_complete_address boolean not null default false,
  required_contact_fields text[] not null default '{}',
  required_opportunity_fields text[] not null default '{}',
  required_contact_custom_field_ids uuid[] not null default '{}',
  required_opportunity_custom_field_ids uuid[] not null default '{}',
  version integer not null default 1,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunity_close_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  policy_version integer not null,
  result text not null check (result in ('allowed', 'blocked', 'overridden')),
  source text not null default 'unknown',
  override_reason text,
  fallback_used boolean not null default false,
  evaluation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (result <> 'overridden' or length(btrim(coalesce(override_reason, ''))) >= 5)
);

create index if not exists idx_opportunity_close_attempts_org_created
  on public.opportunity_close_attempts (organization_id, created_at desc);
create index if not exists idx_opportunity_close_attempts_opportunity
  on public.opportunity_close_attempts (organization_id, opportunity_id, created_at desc);

alter table public.opportunity_close_policies enable row level security;
alter table public.opportunity_close_attempts enable row level security;

drop policy if exists opportunity_close_policies_select on public.opportunity_close_policies;
create policy opportunity_close_policies_select
on public.opportunity_close_policies for select to authenticated
using (organization_id = any(public.current_user_org_ids()));

drop policy if exists opportunity_close_policies_insert on public.opportunity_close_policies;
create policy opportunity_close_policies_insert
on public.opportunity_close_policies for insert to authenticated
with check (public.user_has_org_permission(organization_id, 'can_manage_settings'));

drop policy if exists opportunity_close_policies_update on public.opportunity_close_policies;
create policy opportunity_close_policies_update
on public.opportunity_close_policies for update to authenticated
using (public.user_has_org_permission(organization_id, 'can_manage_settings'))
with check (public.user_has_org_permission(organization_id, 'can_manage_settings'));

drop policy if exists opportunity_close_attempts_select on public.opportunity_close_attempts;
create policy opportunity_close_attempts_select
on public.opportunity_close_attempts for select to authenticated
using (public.user_has_org_permission(organization_id, 'can_manage_settings'));

revoke all on public.opportunity_close_policies from public, anon;
grant select, insert, update on public.opportunity_close_policies to authenticated;
grant all on public.opportunity_close_policies to service_role;
revoke all on public.opportunity_close_attempts from public, anon, authenticated;
grant select on public.opportunity_close_attempts to authenticated;
grant all on public.opportunity_close_attempts to service_role;

create or replace function public.fn_touch_opportunity_close_policy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.version := case when tg_op = 'UPDATE' then old.version + 1 else coalesce(new.version, 1) end;
  new.updated_at := now();
  if auth.role() <> 'service_role' then
    new.updated_by := public.current_user_id();
    if tg_op = 'INSERT' then new.created_by := public.current_user_id(); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_opportunity_close_policy on public.opportunity_close_policies;
create trigger trg_touch_opportunity_close_policy
before insert or update on public.opportunity_close_policies
for each row execute function public.fn_touch_opportunity_close_policy();

create or replace function public.evaluate_opportunity_close_internal_v1(
  _organization_id uuid,
  _opportunity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_op public.opportunities%rowtype;
  v_contact public.contacts%rowtype;
  v_identity public.contact_identity_profiles%rowtype;
  v_policy public.opportunity_close_policies%rowtype;
  v_items jsonb := '[]'::jsonb;
  v_missing text[] := '{}';
  v_field text;
  v_ok boolean;
  v_fallback boolean := false;
  v_value jsonb;
begin
  select * into v_op
  from public.opportunities
  where id = _opportunity_id
    and organization_id = _organization_id
    and deleted_at is null;
  if not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  select * into v_policy
  from public.opportunity_close_policies
  where organization_id = _organization_id;
  if not found then
    v_policy.organization_id := _organization_id;
    v_policy.mode := 'off';
    v_policy.version := 0;
    v_policy.required_contact_fields := '{}';
    v_policy.required_opportunity_fields := '{}';
    v_policy.required_contact_custom_field_ids := '{}';
    v_policy.required_opportunity_custom_field_ids := '{}';
  end if;

  if v_op.contact_id is not null then
    select * into v_contact from public.contacts
    where id = v_op.contact_id and organization_id = _organization_id and deleted_at is null;
    select * into v_identity from public.contact_identity_profiles
    where contact_id = v_op.contact_id and organization_id = _organization_id;
  end if;

  if coalesce(v_policy.require_cpf_verified, false) then
    v_ok := v_contact.id is not null
      and v_identity.cpf_verification_status = 'verified';
    v_fallback := not v_ok
      and public.is_valid_cpf(v_contact.cpf)
      and v_identity.cpf_verification_status = 'error'
      and v_identity.last_failure_class = 'provider_unavailable'
      and v_identity.last_verification_attempt_at >= now() - interval '30 minutes';
    if not v_ok and not v_fallback then v_missing := array_append(v_missing, 'cpf_api_verified'); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'cpf_api_verified',
      'label', 'CPF validado pela API',
      'status', case when v_ok then 'passed' when v_fallback then 'warning' else 'missing' end,
      'action', 'edit_contact',
      'fallback', v_fallback
    ));
  end if;

  if coalesce(v_policy.require_complete_address, false) then
    v_ok := v_contact.id is not null
      and length(btrim(coalesce(v_contact.address_street, ''))) > 0
      and length(btrim(coalesce(v_contact.address_number, ''))) > 0
      and length(btrim(coalesce(v_contact.address_neighborhood, ''))) > 0
      and length(btrim(coalesce(v_contact.address_city, ''))) > 0
      and length(btrim(coalesce(v_contact.address_state, ''))) = 2
      and public.normalize_identity_digits(v_contact.address_zip) ~ '^[0-9]{8}$';
    if not v_ok then v_missing := array_append(v_missing, 'contact_complete_address'); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'contact_complete_address',
      'label', 'Endereço completo',
      'status', case when v_ok then 'passed' else 'missing' end,
      'action', 'edit_contact'
    ));
  end if;

  foreach v_field in array coalesce(v_policy.required_contact_fields, '{}') loop
    v_value := to_jsonb(v_contact) -> v_field;
    v_ok := v_contact.id is not null and v_value is not null and v_value <> 'null'::jsonb
      and btrim(v_value #>> '{}') <> '';
    if not v_ok then v_missing := array_append(v_missing, 'contact_field:' || v_field); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'contact_field:' || v_field,
      'label', replace(initcap(v_field), '_', ' '),
      'status', case when v_ok then 'passed' else 'missing' end,
      'action', 'edit_contact'
    ));
  end loop;

  foreach v_field in array coalesce(v_policy.required_opportunity_fields, '{}') loop
    v_value := to_jsonb(v_op) -> v_field;
    v_ok := v_value is not null and v_value <> 'null'::jsonb and btrim(v_value #>> '{}') <> '';
    if not v_ok then v_missing := array_append(v_missing, 'opportunity_field:' || v_field); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'opportunity_field:' || v_field,
      'label', replace(initcap(v_field), '_', ' '),
      'status', case when v_ok then 'passed' else 'missing' end,
      'action', 'edit_opportunity'
    ));
  end loop;

  for v_field in
    select unnest(coalesce(v_policy.required_contact_custom_field_ids, '{}'))::text
  loop
    select cfv.value into v_value
    from public.custom_field_values cfv
    where cfv.organization_id = _organization_id
      and cfv.record_id = v_op.contact_id
      and cfv.field_definition_id = v_field::uuid;
    v_ok := v_value is not null and v_value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb);
    if not v_ok then v_missing := array_append(v_missing, 'contact_custom:' || v_field); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'contact_custom:' || v_field, 'label', 'Campo personalizado do contato',
      'status', case when v_ok then 'passed' else 'missing' end, 'action', 'edit_contact'
    ));
  end loop;

  for v_field in
    select unnest(coalesce(v_policy.required_opportunity_custom_field_ids, '{}'))::text
  loop
    select cfv.value into v_value
    from public.custom_field_values cfv
    where cfv.organization_id = _organization_id
      and cfv.record_id = v_op.id
      and cfv.field_definition_id = v_field::uuid;
    v_ok := v_value is not null and v_value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb);
    if not v_ok then v_missing := array_append(v_missing, 'opportunity_custom:' || v_field); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'opportunity_custom:' || v_field, 'label', 'Campo personalizado da oportunidade',
      'status', case when v_ok then 'passed' else 'missing' end, 'action', 'edit_opportunity'
    ));
  end loop;

  return jsonb_build_object(
    'organization_id', _organization_id,
    'opportunity_id', v_op.id,
    'contact_id', v_op.contact_id,
    'mode', coalesce(v_policy.mode, 'off'),
    'policy_version', coalesce(v_policy.version, 0),
    'items', v_items,
    'missing_codes', to_jsonb(v_missing),
    'missing_count', cardinality(v_missing),
    'fallback_used', v_fallback,
    'can_close', coalesce(v_policy.mode, 'off') <> 'enforce' or cardinality(v_missing) = 0
  );
end;
$$;

create or replace function public.evaluate_opportunity_close_v1(
  _organization_id uuid,
  _opportunity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and not (_organization_id = any(public.current_user_org_ids())) then
    raise exception 'forbidden_organization' using errcode = '42501';
  end if;
  v_result := public.evaluate_opportunity_close_internal_v1(_organization_id, _opportunity_id);
  return v_result || jsonb_build_object(
    'override_allowed', auth.role() <> 'service_role' and public.is_org_admin(_organization_id)
  );
end;
$$;

create or replace function public.transition_opportunity_stage_v1(
  _organization_id uuid,
  _opportunity_id uuid,
  _target_stage_id uuid,
  _close_date date,
  _override boolean,
  _override_reason text,
  _source text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_op public.opportunities%rowtype;
  v_stage public.pipeline_stages%rowtype;
  v_evaluation jsonb;
  v_override_allowed boolean;
  v_result text;
  v_actor uuid := public.current_user_id();
begin
  if auth.role() <> 'service_role'
     and not public.user_has_org_permission(_organization_id, 'can_edit_opportunities') then
    raise exception 'forbidden_edit_opportunities' using errcode = '42501';
  end if;
  select * into v_op from public.opportunities
  where id = _opportunity_id and organization_id = _organization_id and deleted_at is null
  for update;
  if not found then raise exception 'opportunity_not_found' using errcode = 'P0002'; end if;
  select * into v_stage from public.pipeline_stages
  where id = _target_stage_id and organization_id = _organization_id;
  if not found then raise exception 'target_stage_not_found' using errcode = 'P0002'; end if;

  if v_stage.type::text in ('won', 'lost') and _close_date is null then
    raise exception 'close_date_required' using errcode = '23514';
  end if;

  if v_stage.type::text = 'won' then
    v_evaluation := public.evaluate_opportunity_close_internal_v1(_organization_id, _opportunity_id);
    v_override_allowed := auth.role() <> 'service_role' and public.is_org_admin(_organization_id)
      and length(btrim(coalesce(_override_reason, ''))) >= 5;
    if not coalesce((v_evaluation ->> 'can_close')::boolean, false)
       and not (_override and v_override_allowed) then
      insert into public.opportunity_close_attempts (
        organization_id, opportunity_id, actor_user_id, policy_version, result,
        source, fallback_used, evaluation
      ) values (
        _organization_id, _opportunity_id, v_actor,
        coalesce((v_evaluation ->> 'policy_version')::integer, 0), 'blocked',
        coalesce(nullif(_source, ''), 'unknown'),
        coalesce((v_evaluation ->> 'fallback_used')::boolean, false), v_evaluation
      );
      return v_evaluation || jsonb_build_object('ok', false, 'error', 'closing_requirements_missing');
    end if;
    v_result := case when _override and v_override_allowed then 'overridden' else 'allowed' end;
    perform set_config('app.opportunity_close_authorized', _opportunity_id::text, true);
  else
    v_evaluation := jsonb_build_object('mode', 'off', 'policy_version', 0, 'items', '[]'::jsonb);
    v_result := 'allowed';
  end if;

  update public.opportunities
  set pipeline_stage_id = _target_stage_id,
      status = case v_stage.type::text when 'won' then 'won'::public.opportunity_status
        when 'lost' then 'lost'::public.opportunity_status else 'open'::public.opportunity_status end,
      close_date = case when v_stage.type::text in ('won', 'lost') then _close_date else null end,
      updated_by = v_actor
  where id = _opportunity_id and organization_id = _organization_id;

  if v_stage.type::text = 'won' then
    insert into public.opportunity_close_attempts (
      organization_id, opportunity_id, actor_user_id, policy_version, result,
      source, override_reason, fallback_used, evaluation
    ) values (
      _organization_id, _opportunity_id, v_actor,
      coalesce((v_evaluation ->> 'policy_version')::integer, 0), v_result,
      coalesce(nullif(_source, ''), 'unknown'),
      case when v_result = 'overridden' then btrim(_override_reason) else null end,
      coalesce((v_evaluation ->> 'fallback_used')::boolean, false), v_evaluation
    );
  end if;

  return v_evaluation || jsonb_build_object(
    'ok', true, 'status', v_stage.type::text, 'target_stage_id', _target_stage_id,
    'overridden', v_result = 'overridden'
  );
end;
$$;

create or replace function public.transition_opportunities_stage_batch_v1(
  _organization_id uuid,
  _opportunity_ids uuid[],
  _target_stage_id uuid,
  _close_date date,
  _override boolean,
  _override_reason text,
  _source text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_stage public.pipeline_stages%rowtype;
  v_eval jsonb;
  v_blocked jsonb := '[]'::jsonb;
  v_results jsonb := '[]'::jsonb;
  v_override_allowed boolean;
begin
  if coalesce(cardinality(_opportunity_ids), 0) = 0
     or cardinality(_opportunity_ids) > 100 then
    raise exception 'batch_size_must_be_between_1_and_100' using errcode = '22023';
  end if;
  if auth.role() <> 'service_role'
     and not public.user_has_org_permission(_organization_id, 'can_edit_opportunities') then
    raise exception 'forbidden_edit_opportunities' using errcode = '42501';
  end if;
  select * into v_stage from public.pipeline_stages
  where id = _target_stage_id and organization_id = _organization_id;
  if not found then raise exception 'target_stage_not_found' using errcode = 'P0002'; end if;
  if v_stage.type::text in ('won', 'lost') and _close_date is null then
    raise exception 'close_date_required' using errcode = '23514';
  end if;
  if (select count(*) from public.opportunities
      where organization_id = _organization_id and id = any(_opportunity_ids) and deleted_at is null)
     <> (select count(distinct x) from unnest(_opportunity_ids) x) then
    raise exception 'batch_contains_invalid_opportunity' using errcode = '22023';
  end if;

  v_override_allowed := _override and auth.role() <> 'service_role'
    and public.is_org_admin(_organization_id)
    and length(btrim(coalesce(_override_reason, ''))) >= 5;
  if v_stage.type::text = 'won' then
    foreach v_id in array _opportunity_ids loop
      v_eval := public.evaluate_opportunity_close_internal_v1(_organization_id, v_id);
      if not coalesce((v_eval ->> 'can_close')::boolean, false) then
        v_blocked := v_blocked || jsonb_build_array(v_eval);
      end if;
    end loop;
    if jsonb_array_length(v_blocked) > 0 and not v_override_allowed then
      return jsonb_build_object('ok', false, 'error', 'closing_requirements_missing', 'blocked', v_blocked);
    end if;
  end if;

  foreach v_id in array _opportunity_ids loop
    v_eval := public.transition_opportunity_stage_v1(
      _organization_id, v_id, _target_stage_id, _close_date,
      v_override_allowed, _override_reason, coalesce(nullif(_source, ''), 'batch')
    );
    v_results := v_results || jsonb_build_array(v_eval);
  end loop;
  return jsonb_build_object('ok', true, 'results', v_results);
end;
$$;

create or replace function public.fn_guard_opportunity_won_requirements_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_type text;
  v_old_type text;
  v_mode text;
  v_eval jsonb;
begin
  select type::text into v_target_type from public.pipeline_stages
  where id = new.pipeline_stage_id and organization_id = new.organization_id;
  if tg_op = 'UPDATE' then
    select type::text into v_old_type from public.pipeline_stages where id = old.pipeline_stage_id;
  end if;
  if v_target_type <> 'won' and new.status::text <> 'won' then return new; end if;
  if tg_op = 'UPDATE' and v_old_type = 'won' and old.status::text = 'won' then return new; end if;
  if current_setting('app.opportunity_close_authorized', true) = new.id::text then return new; end if;

  select mode into v_mode from public.opportunity_close_policies where organization_id = new.organization_id;
  if coalesce(v_mode, 'off') <> 'enforce' then return new; end if;
  if tg_op = 'INSERT' or new.contact_id is distinct from old.contact_id then
    raise exception 'use_transition_opportunity_stage_v1' using errcode = '23514';
  end if;
  v_eval := public.evaluate_opportunity_close_internal_v1(new.organization_id, new.id);
  if not coalesce((v_eval ->> 'can_close')::boolean, false) then
    raise exception 'closing_requirements_missing'
      using errcode = '23514', detail = v_eval::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_opportunity_won_requirements_v1 on public.opportunities;
create trigger trg_guard_opportunity_won_requirements_v1
before insert or update of pipeline_stage_id, status, contact_id on public.opportunities
for each row execute function public.fn_guard_opportunity_won_requirements_v1();

create or replace function public.list_entity_documents_v1(
  _organization_id uuid,
  _contact_id uuid default null,
  _opportunity_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_contact_id uuid := _contact_id; v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and not (_organization_id = any(public.current_user_org_ids())) then
    raise exception 'forbidden_organization' using errcode = '42501';
  end if;
  if _opportunity_id is not null then
    select contact_id into v_contact_id from public.opportunities
    where id = _opportunity_id and organization_id = _organization_id and deleted_at is null;
    if not found then raise exception 'opportunity_not_found' using errcode = 'P0002'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'file_name', a.file_name, 'mime_type', a.mime_type,
    'size_bytes', a.size_bytes, 'bucket', a.bucket, 'storage_path', a.storage_path,
    'created_at', a.created_at, 'entity_id', a.entity_id, 'entity_type', a.entity_type,
    'scope', case when a.entity_type = 'opportunity' then 'opportunity' else 'contact' end,
    'origin', case when ds.id is not null then 'checklist'
      when a.entity_type = 'opportunity' then 'opportunity' else 'free' end,
    'document_type_id', ds.document_type_id, 'document_type_name', dt.name,
    'workflow_status', ds.status, 'reviewed_at', ds.reviewed_at,
    'rejection_reason', ds.rejection_reason
  ) order by a.created_at desc), '[]'::jsonb) into v_result
  from public.attachments a
  left join public.document_submissions ds
    on ds.attachment_id = a.id and ds.deleted_at is null and ds.organization_id = _organization_id
  left join public.document_types dt on dt.id = ds.document_type_id
  where a.organization_id = _organization_id and a.deleted_at is null
    and (
      (_opportunity_id is not null and a.entity_type = 'opportunity' and a.entity_id = _opportunity_id)
      or (v_contact_id is not null and a.entity_type in ('contact', 'contact_document') and a.entity_id = v_contact_id)
    );
  return v_result;
end;
$$;

revoke all on function public.evaluate_opportunity_close_internal_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.evaluate_opportunity_close_v1(uuid, uuid) from public, anon;
revoke all on function public.transition_opportunity_stage_v1(uuid, uuid, uuid, date, boolean, text, text) from public, anon;
revoke all on function public.transition_opportunities_stage_batch_v1(uuid, uuid[], uuid, date, boolean, text, text) from public, anon;
revoke all on function public.list_entity_documents_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.evaluate_opportunity_close_v1(uuid, uuid) to authenticated, service_role;
grant execute on function public.transition_opportunity_stage_v1(uuid, uuid, uuid, date, boolean, text, text) to authenticated, service_role;
grant execute on function public.transition_opportunities_stage_batch_v1(uuid, uuid[], uuid, date, boolean, text, text) to authenticated, service_role;
grant execute on function public.list_entity_documents_v1(uuid, uuid, uuid) to authenticated, service_role;

insert into public.opportunity_close_policies (
  organization_id, mode, require_cpf_verified, require_complete_address
) values
  ('40ae935c-a7f7-4ad7-8ea4-91be6404a95f'::uuid, 'monitor', true, true),
  ('b246ef6f-6242-4011-a112-6d8783d2896a'::uuid, 'off', false, false)
on conflict (organization_id) do nothing;

select pg_notify('pgrst', 'reload schema');

commit;
