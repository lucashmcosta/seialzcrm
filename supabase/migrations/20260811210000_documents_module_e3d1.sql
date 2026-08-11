-- Etapa 3d-1: evaluator ganha OR nas condições (when.any) e GRUPOS de alternativas no
-- exigido (required item = string OU {anyOf:[codes], label}). Grupo satisfaz se QUALQUER
-- alternativa tem documento corrente e completo (owner-aware). Preserva CPF/endereço/
-- campos/custom idênticos e a semântica de when.all/priority da 3a.
-- Reversível: DOWN em supabase/rollback/.

create or replace function public.evaluate_opportunity_close_internal_v1(_organization_id uuid, _opportunity_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_op public.opportunities%rowtype; v_contact public.contacts%rowtype; v_identity public.contact_identity_profiles%rowtype;
  v_policy public.opportunity_close_policies%rowtype; v_items jsonb := '[]'::jsonb; v_missing text[] := '{}';
  v_field text; v_ok boolean; v_fallback boolean := false; v_value jsonb;
  v_set jsonb; v_best_set jsonb; v_when jsonb; v_cond jsonb; v_match boolean; v_code text; v_dt record; v_owner_id uuid; v_fmod text; v_rec uuid; v_cfv jsonb;
  v_item jsonb; v_codes text[]; v_label text; v_type_ids uuid[]; v_owner text; v_names text; v_any boolean; v_cmatch boolean;
begin
  select * into v_op from public.opportunities where id=_opportunity_id and organization_id=_organization_id and deleted_at is null;
  if not found then raise exception 'opportunity_not_found' using errcode='P0002'; end if;
  select * into v_policy from public.opportunity_close_policies where organization_id=_organization_id;
  if not found then v_policy.organization_id:=_organization_id; v_policy.mode:='off'; v_policy.version:=0;
    v_policy.required_contact_fields:='{}'; v_policy.required_opportunity_fields:='{}'; v_policy.required_contact_custom_field_ids:='{}'; v_policy.required_opportunity_custom_field_ids:='{}'; end if;
  if v_op.contact_id is not null then
    select * into v_contact from public.contacts where id=v_op.contact_id and organization_id=_organization_id and deleted_at is null;
    select * into v_identity from public.contact_identity_profiles where contact_id=v_op.contact_id and organization_id=_organization_id;
  end if;
  if coalesce(v_policy.require_cpf_verified,false) then
    v_ok:=v_contact.id is not null and v_identity.cpf_verification_status='verified';
    v_fallback:=not v_ok and public.is_valid_cpf(v_contact.cpf) and v_identity.cpf_verification_status='error' and v_identity.last_failure_class='provider_unavailable' and v_identity.last_verification_attempt_at>=now()-interval '30 minutes';
    if not v_ok and not v_fallback then v_missing:=array_append(v_missing,'cpf_api_verified'); end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object('code','cpf_api_verified','label','CPF validado pela API','status',case when v_ok then 'passed' when v_fallback then 'warning' else 'missing' end,'action','edit_contact','fallback',v_fallback));
  end if;
  if coalesce(v_policy.require_complete_address,false) then
    v_ok:=v_contact.id is not null and length(btrim(coalesce(v_contact.address_street,'')))>0 and length(btrim(coalesce(v_contact.address_number,'')))>0 and length(btrim(coalesce(v_contact.address_neighborhood,'')))>0 and length(btrim(coalesce(v_contact.address_city,'')))>0 and length(btrim(coalesce(v_contact.address_state,'')))=2 and public.normalize_identity_digits(v_contact.address_zip) ~ '^[0-9]{8}$';
    if not v_ok then v_missing:=array_append(v_missing,'contact_complete_address'); end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object('code','contact_complete_address','label','Endereço completo','status',case when v_ok then 'passed' else 'missing' end,'action','edit_contact'));
  end if;
  foreach v_field in array coalesce(v_policy.required_contact_fields,'{}') loop
    v_value:=to_jsonb(v_contact)->v_field; v_ok:=v_contact.id is not null and v_value is not null and v_value<>'null'::jsonb and btrim(v_value #>> '{}')<>'';
    if not v_ok then v_missing:=array_append(v_missing,'contact_field:'||v_field); end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object('code','contact_field:'||v_field,'label',replace(initcap(v_field),'_',' '),'status',case when v_ok then 'passed' else 'missing' end,'action','edit_contact'));
  end loop;
  foreach v_field in array coalesce(v_policy.required_opportunity_fields,'{}') loop
    v_value:=to_jsonb(v_op)->v_field; v_ok:=v_value is not null and v_value<>'null'::jsonb and btrim(v_value #>> '{}')<>'';
    if not v_ok then v_missing:=array_append(v_missing,'opportunity_field:'||v_field); end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object('code','opportunity_field:'||v_field,'label',replace(initcap(v_field),'_',' '),'status',case when v_ok then 'passed' else 'missing' end,'action','edit_opportunity'));
  end loop;
  for v_field in select unnest(coalesce(v_policy.required_contact_custom_field_ids,'{}'))::text loop
    select cfv.value into v_value from public.custom_field_values cfv where cfv.organization_id=_organization_id and cfv.record_id=v_op.contact_id and cfv.field_definition_id=v_field::uuid;
    v_ok:=v_value is not null and v_value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb);
    if not v_ok then v_missing:=array_append(v_missing,'contact_custom:'||v_field); end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object('code','contact_custom:'||v_field,'label','Campo personalizado do contato','status',case when v_ok then 'passed' else 'missing' end,'action','edit_contact'));
  end loop;
  for v_field in select unnest(coalesce(v_policy.required_opportunity_custom_field_ids,'{}'))::text loop
    select cfv.value into v_value from public.custom_field_values cfv where cfv.organization_id=_organization_id and cfv.record_id=v_op.id and cfv.field_definition_id=v_field::uuid;
    v_ok:=v_value is not null and v_value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb);
    if not v_ok then v_missing:=array_append(v_missing,'opportunity_custom:'||v_field); end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object('code','opportunity_custom:'||v_field,'label','Campo personalizado da oportunidade','status',case when v_ok then 'passed' else 'missing' end,'action','edit_opportunity'));
  end loop;

  -- Resolve UM set: maior priority cujo `when` casa. when.all=AND, when.any=OR (>=1).
  -- Ambos presentes => os dois valem. when null => default.
  v_best_set:=null;
  for v_set in select value from jsonb_array_elements(coalesce(v_policy.document_rules->'sets','[]'::jsonb)) as t(value)
    order by coalesce((value->>'priority')::int,0) desc, coalesce(value->>'id','') asc
  loop
    v_match:=true; v_when:=v_set->'when';
    if v_when is not null and jsonb_typeof(v_when)='object' then
      -- AND: toda condição de `all` precisa valer
      for v_cond in select value from jsonb_array_elements(coalesce(v_when->'all','[]'::jsonb)) as t(value) loop
        select cfd.module into v_fmod from public.custom_field_definitions cfd where cfd.id=(v_cond->>'field')::uuid and cfd.organization_id=_organization_id;
        v_rec:=case when v_fmod in ('opportunities','opportunity') then v_op.id else v_op.contact_id end;
        select cfv.value into v_cfv from public.custom_field_values cfv where cfv.organization_id=_organization_id and cfv.field_definition_id=(v_cond->>'field')::uuid and cfv.record_id=v_rec;
        if coalesce(v_cond->>'op','eq')='in' then
          v_match:=v_match and v_cfv is not null and (v_cfv #>> '{}') in (select jsonb_array_elements_text(coalesce(v_cond->'value','[]'::jsonb)));
        else v_match:=v_match and v_cfv is not null and (v_cfv #>> '{}')=(v_cond->>'value'); end if;
        if not v_match then exit; end if;
      end loop;
      -- OR: se houver `any` não-vazio, pelo menos uma condição precisa valer
      if v_match and jsonb_array_length(coalesce(v_when->'any','[]'::jsonb)) > 0 then
        v_any:=false;
        for v_cond in select value from jsonb_array_elements(coalesce(v_when->'any','[]'::jsonb)) as t(value) loop
          select cfd.module into v_fmod from public.custom_field_definitions cfd where cfd.id=(v_cond->>'field')::uuid and cfd.organization_id=_organization_id;
          v_rec:=case when v_fmod in ('opportunities','opportunity') then v_op.id else v_op.contact_id end;
          select cfv.value into v_cfv from public.custom_field_values cfv where cfv.organization_id=_organization_id and cfv.field_definition_id=(v_cond->>'field')::uuid and cfv.record_id=v_rec;
          if coalesce(v_cond->>'op','eq')='in' then
            v_cmatch:=v_cfv is not null and (v_cfv #>> '{}') in (select jsonb_array_elements_text(coalesce(v_cond->'value','[]'::jsonb)));
          else v_cmatch:=v_cfv is not null and (v_cfv #>> '{}')=(v_cond->>'value'); end if;
          if v_cmatch then v_any:=true; exit; end if;
        end loop;
        v_match:=v_match and v_any;
      end if;
    end if;
    if v_match then v_best_set:=v_set; exit; end if;
  end loop;

  if v_best_set is not null then
    for v_item in select value from jsonb_array_elements(coalesce(v_best_set->'required','[]'::jsonb)) as t(value) loop
      -- Item: string (código único) OU objeto {anyOf:[códigos], label}
      if jsonb_typeof(v_item)='string' then
        v_codes:=array[v_item #>> '{}']; v_label:=null;
      elsif jsonb_typeof(v_item)='object' then
        v_codes:=array(select jsonb_array_elements_text(coalesce(v_item->'anyOf','[]'::jsonb)));
        v_label:=nullif(btrim(coalesce(v_item->>'label','')),'');
      else continue; end if;
      if array_length(v_codes,1) is null then continue; end if;

      -- Resolve códigos -> tipos (org-local precede global; ativo, não deletado).
      v_type_ids:='{}'; v_names:=null; v_owner:=null;
      for v_dt in
        select dt.id, dt.owner_type, dt.name
        from unnest(v_codes) with ordinality as c(code, ord)
        join lateral (
          select d2.id, d2.owner_type, d2.name
          from public.document_types d2
          where d2.code=c.code and d2.deleted_at is null and d2.is_active
            and (d2.organization_id=_organization_id or d2.organization_id is null)
          order by d2.organization_id nulls last
          limit 1
        ) dt on true
        order by c.ord
      loop
        v_type_ids:=v_type_ids || v_dt.id;
        v_owner:=coalesce(v_owner, v_dt.owner_type);
        v_names:=case when v_names is null then v_dt.name else v_names || ' ou ' || v_dt.name end;
      end loop;
      if array_length(v_type_ids,1) is null then continue; end if;

      -- Satisfaz se QUALQUER alternativa tem doc corrente e completo (owner-aware).
      v_owner_id:=case when v_owner='opportunity' then v_op.id else v_op.contact_id end;
      v_ok:=v_owner_id is not null and exists (
        select 1 from public.documents d
        where d.organization_id=_organization_id and d.entity_type=v_owner
          and d.entity_id=v_owner_id and d.document_type_id = any(v_type_ids)
          and d.deleted_at is null and d.superseded_by_id is null and not coalesce(d.is_incomplete,false)
      );
      v_code:='document:'|| array_to_string(v_type_ids, ',');
      if not v_ok then v_missing:=array_append(v_missing, v_code); end if;
      v_items:=v_items||jsonb_build_array(jsonb_build_object(
        'code', v_code,
        'document_type_id', v_type_ids[1],
        'document_type_ids', to_jsonb(v_type_ids),
        'owner_type', v_owner,
        'label', coalesce(v_label, v_names),
        'status', case when v_ok then 'passed' else 'missing' end,
        'action', 'edit_documents'
      ));
    end loop;
  end if;

  return jsonb_build_object('organization_id',_organization_id,'opportunity_id',v_op.id,'contact_id',v_op.contact_id,'mode',coalesce(v_policy.mode,'off'),'policy_version',coalesce(v_policy.version,0),'items',v_items,'missing_codes',to_jsonb(v_missing),'missing_count',cardinality(v_missing),'fallback_used',v_fallback,'can_close',coalesce(v_policy.mode,'off')<>'enforce' or cardinality(v_missing)=0);
end; $function$;
