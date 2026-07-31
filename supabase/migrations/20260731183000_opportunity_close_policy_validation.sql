begin;

create or replace function public.fn_validate_opportunity_close_policy_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_country text;
begin
  select operating_country_code into v_country
  from public.organizations where id = new.organization_id;

  if (new.require_cpf_verified or new.require_complete_address)
     and v_country is distinct from 'BR' then
    raise exception 'br_closing_rules_require_br_organization' using errcode = '23514';
  end if;

  if not (coalesce(new.required_contact_fields, '{}')
     <@ array['email','phone','rg','nationality']::text[]) then
    raise exception 'invalid_required_contact_field' using errcode = '22023';
  end if;
  if not (coalesce(new.required_opportunity_fields, '{}')
     <@ array['title','amount','source','owner_user_id']::text[]) then
    raise exception 'invalid_required_opportunity_field' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(coalesce(new.required_contact_custom_field_ids, '{}')) as fields(field_id)
    left join public.custom_field_definitions definition
      on definition.id = fields.field_id
     and definition.organization_id = new.organization_id
     and definition.module = 'contacts'
    where definition.id is null
  ) then
    raise exception 'invalid_contact_custom_field' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(new.required_opportunity_custom_field_ids, '{}')) as fields(field_id)
    left join public.custom_field_definitions definition
      on definition.id = fields.field_id
     and definition.organization_id = new.organization_id
     and definition.module = 'opportunities'
    where definition.id is null
  ) then
    raise exception 'invalid_opportunity_custom_field' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_opportunity_close_policy_v1
  on public.opportunity_close_policies;
create trigger trg_validate_opportunity_close_policy_v1
before insert or update on public.opportunity_close_policies
for each row execute function public.fn_validate_opportunity_close_policy_v1();

select pg_notify('pgrst', 'reload schema');
commit;
