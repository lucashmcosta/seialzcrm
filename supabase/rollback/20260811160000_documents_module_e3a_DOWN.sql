-- ROLLBACK Etapa 3a. Restaura o evaluator anterior (seção de docs flat por
-- document_type_id no contato) e o shape default {version:1, rules:[]}.
-- Regras já em formato sets permanecem no jsonb (o evaluator antigo as ignora).

begin;

create or replace function public.evaluate_opportunity_close_internal_v1(_organization_id uuid, _opportunity_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_op public.opportunities%rowtype; v_contact public.contacts%rowtype; v_identity public.contact_identity_profiles%rowtype;
  v_policy public.opportunity_close_policies%rowtype; v_items jsonb := '[]'::jsonb; v_missing text[] := '{}';
  v_field text; v_ok boolean; v_fallback boolean := false; v_value jsonb;
begin
  select * into v_op from public.opportunities where id = _opportunity_id and organization_id = _organization_id and deleted_at is null;
  if not found then raise exception 'opportunity_not_found' using errcode = 'P0002'; end if;
  select * into v_policy from public.opportunity_close_policies where organization_id = _organization_id;
  if not found then
    v_policy.organization_id := _organization_id; v_policy.mode := 'off'; v_policy.version := 0;
    v_policy.required_contact_fields := '{}'; v_policy.required_opportunity_fields := '{}';
    v_policy.required_contact_custom_field_ids := '{}'; v_policy.required_opportunity_custom_field_ids := '{}';
  end if;
  if v_op.contact_id is not null then
    select * into v_contact from public.contacts where id = v_op.contact_id and organization_id = _organization_id and deleted_at is null;
    select * into v_identity from public.contact_identity_profiles where contact_id = v_op.contact_id and organization_id = _organization_id;
  end if;
  if coalesce(v_policy.require_cpf_verified, false) then
    v_ok := v_contact.id is not null and v_identity.cpf_verification_status = 'verified';
    v_fallback := not v_ok and public.is_valid_cpf(v_contact.cpf) and v_identity.cpf_verification_status = 'error'
      and v_identity.last_failure_class = 'provider_unavailable' and v_identity.last_verification_attempt_at >= now() - interval '30 minutes';
    if not v_ok and not v_fallback then v_missing := array_append(v_missing, 'cpf_api_verified'); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('code','cpf_api_verified','label','CPF validado pela API',
      'status', case when v_ok then 'passed' when v_fallback then 'warning' else 'missing' end,'action','edit_contact','fallback',v_fallback));
  end if;
  if coalesce(v_policy.require_complete_address, false) then
    v_ok := v_contact.id is not null and length(btrim(coalesce(v_contact.address_street,'')))>0 and length(btrim(coalesce(v_contact.address_number,'')))>0
      and length(btrim(coalesce(v_contact.address_neighborhood,'')))>0 and length(btrim(coalesce(v_contact.address_city,'')))>0
      and length(btrim(coalesce(v_contact.address_state,'')))=2 and public.normalize_identity_digits(v_contact.address_zip) ~ '^[0-9]{8}$';
    if not v_ok then v_missing := array_append(v_missing, 'contact_complete_address'); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('code','contact_complete_address','label','Endereço completo',
      'status', case when v_ok then 'passed' else 'missing' end,'action','edit_contact'));
  end if;
  foreach v_field in array coalesce(v_policy.required_contact_fields, '{}') loop
    v_value := to_jsonb(v_contact) -> v_field;
    v_ok := v_contact.id is not null and v_value is not null and v_value <> 'null'::jsonb and btrim(v_value #>> '{}') <> '';
    if not v_ok then v_missing := array_append(v_missing, 'contact_field:' || v_field); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('code','contact_field:' || v_field,'label',replace(initcap(v_field),'_',' '),
      'status', case when v_ok then 'passed' else 'missing' end,'action','edit_contact'));
  end loop;
  foreach v_field in array coalesce(v_policy.required_opportunity_fields, '{}') loop
    v_value := to_jsonb(v_op) -> v_field;
    v_ok := v_value is not null and v_value <> 'null'::jsonb and btrim(v_value #>> '{}') <> '';
    if not v_ok then v_missing := array_append(v_missing, 'opportunity_field:' || v_field); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('code','opportunity_field:' || v_field,'label',replace(initcap(v_field),'_',' '),
      'status', case when v_ok then 'passed' else 'missing' end,'action','edit_opportunity'));
  end loop;
  for v_field in select unnest(coalesce(v_policy.required_contact_custom_field_ids, '{}'))::text loop
    select cfv.value into v_value from public.custom_field_values cfv
    where cfv.organization_id = _organization_id and cfv.record_id = v_op.contact_id and cfv.field_definition_id = v_field::uuid;
    v_ok := v_value is not null and v_value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb);
    if not v_ok then v_missing := array_append(v_missing, 'contact_custom:' || v_field); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('code','contact_custom:' || v_field,'label','Campo personalizado do contato',
      'status', case when v_ok then 'passed' else 'missing' end,'action','edit_contact'));
  end loop;
  for v_field in select unnest(coalesce(v_policy.required_opportunity_custom_field_ids, '{}'))::text loop
    select cfv.value into v_value from public.custom_field_values cfv
    where cfv.organization_id = _organization_id and cfv.record_id = v_op.id and cfv.field_definition_id = v_field::uuid;
    v_ok := v_value is not null and v_value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb);
    if not v_ok then v_missing := array_append(v_missing, 'opportunity_custom:' || v_field); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('code','opportunity_custom:' || v_field,'label','Campo personalizado da oportunidade',
      'status', case when v_ok then 'passed' else 'missing' end,'action','edit_opportunity'));
  end loop;
  for v_field in
    select (r->>'document_type_id') from jsonb_array_elements(coalesce(v_policy.document_rules -> 'rules', '[]'::jsonb)) r
    where coalesce(r->>'effect', 'require') = 'require' and (r->>'document_type_id') is not null
  loop
    v_ok := v_op.contact_id is not null and exists (
      select 1 from public.documents d where d.organization_id = _organization_id and d.entity_type = 'contact'
        and d.entity_id = v_op.contact_id and d.document_type_id = v_field::uuid and d.deleted_at is null);
    if not v_ok then v_missing := array_append(v_missing, 'document:' || v_field); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('code','document:' || v_field,
      'label', coalesce((select name from public.document_types dt where dt.id = v_field::uuid), 'Documento'),
      'status', case when v_ok then 'passed' else 'missing' end,'action','edit_documents'));
  end loop;
  return jsonb_build_object('organization_id',_organization_id,'opportunity_id',v_op.id,'contact_id',v_op.contact_id,
    'mode', coalesce(v_policy.mode,'off'),'policy_version', coalesce(v_policy.version,0),'items',v_items,
    'missing_codes', to_jsonb(v_missing),'missing_count', cardinality(v_missing),'fallback_used', v_fallback,
    'can_close', coalesce(v_policy.mode,'off') <> 'enforce' or cardinality(v_missing) = 0);
end;
$function$;

alter table public.opportunity_close_policies alter column document_rules set default '{"version": 1, "rules": []}'::jsonb;
update public.opportunity_close_policies
   set document_rules = jsonb_build_object('version', 1, 'rules', '[]'::jsonb)
 where coalesce(document_rules ->> 'version', '') = '2';

select pg_notify('pgrst', 'reload schema');
commit;
