-- Keep the operational audit bounded by the expected contract/opportunity
-- pairs. The previous implementation scanned every integration event by a
-- suffix pattern and could exceed the production statement timeout.

create or replace function public.nammux_contact_contract_audit_v1(
  _organization_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with contracts as (
    select d.id, d.entity_id as contact_id
    from public.documents d
    where d.organization_id = _organization_id
      and d.external_source = 'suvsign'
      and d.external_ref is not null
      and d.deleted_at is null
      and d.entity_type = 'contact'
  ), expected as (
    select
      c.id as document_id,
      o.id as opportunity_id,
      'seialz:opportunity.won:' || _organization_id::text || ':' ||
        o.id::text || ':replay:contact-document:' || c.id::text as idempotency_key
    from contracts c
    join public.opportunities o
      on o.organization_id = _organization_id
     and o.contact_id = c.contact_id
     and o.deleted_at is null
    join public.pipeline_stages ps
      on ps.id = o.pipeline_stage_id
     and ps.type = 'won'
  )
  select jsonb_build_object(
    'organization_id', _organization_id,
    'contact_contracts', (select count(*) from contracts),
    'contacts_with_contract', (select count(distinct contact_id) from contracts),
    'expected_pairs', (select count(*) from expected),
    'replay_events', (
      select count(*)
      from expected e
      where exists (
        select 1
        from public.integration_events ie
        where ie.idempotency_key = e.idempotency_key
          and ie.organization_id = _organization_id
          and ie.event_type = 'opportunity.won'
      )
    ),
    'missing_replay_pairs', (
      select count(*)
      from expected e
      where not exists (
        select 1
        from public.integration_events ie
        where ie.idempotency_key = e.idempotency_key
          and ie.organization_id = _organization_id
          and ie.event_type = 'opportunity.won'
      )
    ),
    'opportunity_owned_suvsign_contracts', (
      select count(*) from public.documents d
      where d.organization_id = _organization_id
        and d.external_source = 'suvsign'
        and d.external_ref is not null
        and d.deleted_at is null
        and d.entity_type = 'opportunity'
    )
  );
$function$;

revoke all on function public.nammux_contact_contract_audit_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.nammux_contact_contract_audit_v1(uuid)
  to service_role;

comment on function public.nammux_contact_contract_audit_v1(uuid) is
  'Audits contact-owned SuvSign contract fan-out through exact indexed idempotency keys.';
