\set ON_ERROR_STOP on

-- Contrato do evento process.agenda.changed com o Nammux.
-- supabase/tests/fixtures/nammux/process.agenda.changed.json é o payload que o
-- trigger do Nammux produz de verdade (lá o mesmo arquivo fica em
-- supabase/tests/fixtures/seialz/ e um teste garante que ele não mudou).
-- Aqui provamos que o Seialz aplica esse payload sem adaptação.
-- Mudou o payload? Atualize o arquivo NOS DOIS repositórios.
--
-- Rodar da raiz do repositório, contra Postgres descartável com o schema do
-- Seialz e a migration 20261118110000 aplicados.

\set fixture `cat supabase/tests/fixtures/nammux/process.agenda.changed.json`

begin;

set local session_replication_role = replica;
insert into public.organizations (id, name, slug) values
  ('f1000000-0000-4000-8000-0000000000b1', 'Org do contrato', 'teste-contrato-agenda');
insert into public.opportunities (id, organization_id, title, pipeline_stage_id) values
  ('f6000000-0000-4000-8000-0000000000d1', 'f1000000-0000-4000-8000-0000000000b1', 'Negócio', gen_random_uuid());
set local session_replication_role = origin;

select set_config('teste.fixture', :'fixture', true);

do $contrato$
declare
  v_data jsonb := current_setting('teste.fixture')::jsonb;
  v_org uuid := 'f1000000-0000-4000-8000-0000000000b1';
  v_r jsonb;
  v_row public.nammux_process_events;
begin
  -- A organização de destino do payload é a do Seialz.
  if (v_data->>'seialz_organization_id')::uuid <> v_org then
    raise exception 'fixture com organização inesperada';
  end if;
  v_r := public.nammux_apply_process_event(v_org, 'evento-do-contrato', v_data, now());
  if v_r->>'status' <> 'applied' then
    raise exception 'CONTRATO QUEBRADO: o payload do Nammux não foi aplicado: %', v_r;
  end if;
  select * into v_row from public.nammux_process_events where organization_id = v_org;
  if v_row.external_event_id <> 'f4000000-0000-4000-8000-000000000001'
     or v_row.external_process_id <> 'f3000000-0000-4000-8000-0000000000a1'
     or v_row.opportunity_id <> 'f6000000-0000-4000-8000-0000000000d1'
     or v_row.event_type <> 'audiencia'
     or v_row.subtype <> 'Instrução'
     or v_row.status <> 'pendente'
     or v_row.start_at <> '2026-12-10 13:00:00+00'::timestamptz
     or v_row.end_at is not null
     or v_row.all_day
     or v_row.timezone <> 'America/Sao_Paulo'
     or v_row.modality <> 'virtual'
     or v_row.location is not null
     or v_row.virtual_link <> 'https://exemplo.invalid/sala'
     or v_row.root_external_event_id <> 'f4000000-0000-4000-8000-000000000001'
     or v_row.rescheduled_from_external_event_id is not null
     or v_row.reschedule_seq <> 0
     or v_row.last_change <> 'scheduled'
     or v_row.source_version <> 1000
     or v_row.source_updated_at <> '2026-11-18 12:00:00+00'::timestamptz then
    raise exception 'CONTRATO QUEBRADO: campo lido errado: %', to_jsonb(v_row);
  end if;
  raise notice 'nammux_agenda_contrato: OK';
end
$contrato$;

rollback;
