begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(10);

insert into public.organizations (id, name, slug)
values (
  '10000000-0000-0000-0000-000000000001',
  'Nammux post-win test',
  'nammux-post-win-test'
);

insert into public.admin_integrations (id, name, slug, status, category)
values (
  '10000000-0000-0000-0000-000000000002',
  'Nammux',
  'nammux',
  'available',
  'automation'
)
on conflict (slug) do nothing;

-- Keep the fixture deterministic; subscription fanout is tested separately by
-- the existing integration pipeline.
alter table public.organization_integrations disable trigger trg_sync_nammux_subscription;
insert into public.organization_integrations (
  organization_id,
  integration_id,
  is_enabled,
  config_values
)
select
  '10000000-0000-0000-0000-000000000001',
  ai.id,
  true,
  jsonb_build_object(
    'enabled', true,
    'send_opportunity_won', true,
    'include_opportunity_attachments', true
  )
from public.admin_integrations ai
where ai.slug = 'nammux';
alter table public.organization_integrations enable trigger trg_sync_nammux_subscription;

insert into public.integration_subscriptions (
  organization_id,
  integration_slug,
  event_type,
  target_action,
  is_active
) values (
  '10000000-0000-0000-0000-000000000001',
  'nammux',
  'opportunity.won',
  'send_opportunity_won',
  true
);

insert into public.pipeline_stages (id, organization_id, name, order_index, type)
values (
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'Won test',
  1,
  'won'
);

insert into public.contacts (id, organization_id, full_name)
values (
  '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'Post-win test contact'
);

-- Avoid unrelated opportunity automations while preparing the fixture. The
-- original delivery is represented explicitly below.
alter table public.opportunities disable trigger user;
insert into public.opportunities (
  id,
  organization_id,
  title,
  contact_id,
  pipeline_stage_id,
  status
) values (
  '10000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  'Post-win test opportunity',
  '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000003',
  'won'
), (
  '10000000-0000-0000-0000-00000000000d',
  '10000000-0000-0000-0000-000000000001',
  'Undelivered opportunity',
  '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000003',
  'won'
);
alter table public.opportunities enable trigger user;

insert into public.integration_events (
  id,
  organization_id,
  aggregate_type,
  aggregate_id,
  event_type,
  payload,
  idempotency_key,
  status
) values (
  '10000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000001',
  'opportunity',
  '10000000-0000-0000-0000-000000000005',
  'opportunity.won',
  '{}'::jsonb,
  'test:original-won',
  'published'
);

update public.integration_jobs
set status = 'success', completed_at = now()
where event_id = '10000000-0000-0000-0000-000000000006'
  and integration_slug = 'nammux'
  and target_action = 'send_opportunity_won';

insert into public.integration_events (
  id,
  organization_id,
  aggregate_type,
  aggregate_id,
  event_type,
  payload,
  idempotency_key,
  status
) values (
  '10000000-0000-0000-0000-00000000000e',
  '10000000-0000-0000-0000-000000000001',
  'opportunity',
  '10000000-0000-0000-0000-00000000000d',
  'opportunity.won',
  '{}'::jsonb,
  'test:undelivered-won',
  'published'
);

insert into public.documents (
  id,
  organization_id,
  entity_type,
  entity_id,
  bucket,
  storage_path,
  file_name
) values (
  '10000000-0000-0000-0000-00000000000f',
  '10000000-0000-0000-0000-000000000001',
  'opportunity',
  '10000000-0000-0000-0000-00000000000d',
  'attachments',
  'test/undelivered.pdf',
  'Undelivered.pdf'
);

select is(
  (
    select count(*)::integer
    from public.integration_events
    where idempotency_key like '%:replay:document:10000000-0000-0000-0000-00000000000f'
  ),
  0,
  'does not create a Nammux process when the original job was not delivered'
);

insert into public.documents (
  id,
  organization_id,
  entity_type,
  entity_id,
  bucket,
  storage_path,
  file_name,
  mime_type,
  size_bytes
) values (
  '10000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000001',
  'opportunity',
  '10000000-0000-0000-0000-000000000005',
  'attachments',
  'test/contract.pdf',
  'Contrato assinado.pdf',
  'application/pdf',
  1234
);

select is(
  (
    select count(*)::integer
    from public.integration_events
    where idempotency_key =
      'seialz:opportunity.won:10000000-0000-0000-0000-000000000001:' ||
      '10000000-0000-0000-0000-000000000005:replay:document:' ||
      '10000000-0000-0000-0000-000000000007'
  ),
  1,
  'queues exactly one replay for a new post-win opportunity document'
);

select is(
  (
    select payload #>> '{_replay,replay_reason}'
    from public.integration_events
    where idempotency_key like '%:replay:document:10000000-0000-0000-0000-000000000007'
  ),
  'document_added_after_win',
  'marks the replay reason'
);

select is(
  (
    select jsonb_array_length(payload->'attachments')
    from public.integration_events
    where idempotency_key like '%:replay:document:10000000-0000-0000-0000-000000000007'
  ),
  1,
  'sends a focused one-document payload'
);

select is(
  (
    select payload #>> '{attachments,0,id}'
    from public.integration_events
    where idempotency_key like '%:replay:document:10000000-0000-0000-0000-000000000007'
  ),
  '10000000-0000-0000-0000-000000000007',
  'places the new document in the payload'
);

insert into public.documents (
  id, organization_id, entity_type, entity_id, bucket, storage_path, file_name
) values (
  '10000000-0000-0000-0000-000000000008',
  '10000000-0000-0000-0000-000000000001',
  'contact',
  '10000000-0000-0000-0000-000000000004',
  'attachments',
  'test/contact.pdf',
  'Contact document.pdf'
);

select is(
  (
    select count(*)::integer
    from public.integration_events
    where idempotency_key like '%:replay:document:10000000-0000-0000-0000-000000000008'
  ),
  0,
  'does not route contact documents implicitly'
);

insert into public.documents (
  id, organization_id, entity_type, entity_id, bucket, storage_path, file_name, is_sample
) values (
  '10000000-0000-0000-0000-000000000009',
  '10000000-0000-0000-0000-000000000001',
  'opportunity',
  '10000000-0000-0000-0000-000000000005',
  'attachments',
  'test/sample.pdf',
  'Sample.pdf',
  true
);

select is(
  (
    select count(*)::integer
    from public.integration_events
    where idempotency_key like '%:replay:document:10000000-0000-0000-0000-000000000009'
  ),
  0,
  'ignores sample documents'
);

update public.organization_integrations oi
set config_values = jsonb_set(oi.config_values, '{include_opportunity_attachments}', 'false'::jsonb)
from public.admin_integrations ai
where ai.id = oi.integration_id
  and ai.slug = 'nammux'
  and oi.organization_id = '10000000-0000-0000-0000-000000000001';

insert into public.documents (
  id, organization_id, entity_type, entity_id, bucket, storage_path, file_name
) values (
  '10000000-0000-0000-0000-00000000000a',
  '10000000-0000-0000-0000-000000000001',
  'opportunity',
  '10000000-0000-0000-0000-000000000005',
  'attachments',
  'test/disabled.pdf',
  'Disabled.pdf'
);

select is(
  (
    select count(*)::integer
    from public.integration_events
    where idempotency_key like '%:replay:document:10000000-0000-0000-0000-00000000000a'
  ),
  0,
  'respects include_opportunity_attachments=false'
);

select lives_ok(
  $$
    insert into public.documents (
      id, organization_id, entity_type, entity_id, bucket, storage_path,
      file_name, external_source, external_ref
    ) values (
      '10000000-0000-0000-0000-00000000000b',
      '10000000-0000-0000-0000-000000000001',
      'contact',
      '10000000-0000-0000-0000-000000000004',
      'attachments',
      'test/provider.pdf',
      'Provider.pdf',
      'suvsign',
      'provider-document-1'
    )
  $$,
  'accepts the first provider document reference'
);

select throws_like(
  $$
    insert into public.documents (
      id, organization_id, entity_type, entity_id, bucket, storage_path,
      file_name, external_source, external_ref
    ) values (
      '10000000-0000-0000-0000-00000000000c',
      '10000000-0000-0000-0000-000000000001',
      'contact',
      '10000000-0000-0000-0000-000000000004',
      'attachments',
      'test/provider-duplicate.pdf',
      'Provider duplicate.pdf',
      'suvsign',
      'provider-document-1'
    )
  $$,
  '%duplicate key value violates unique constraint%',
  'rejects a duplicated provider document reference'
);

select * from finish();

rollback;
