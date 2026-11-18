\set ON_ERROR_STOP on

-- Financeiro do Nammux (20261118120000_nammux_process_finance.sql).
-- O que este teste existe para provar:
--   * cada coisa que aconteceu ("pagou", "venceu", "homologou", "estornou",
--     "repassou") é deduzida UMA vez, mesmo com reentrega e fora de ordem
--   * a parcela pode chegar antes do acordo dela
--   * payload com campo malformado é recusa definitiva e não deixa nada gravado
--   * a tabela é só service_role
--
-- Rodar da raiz do repositório, contra Postgres descartável com o schema do
-- Seialz e as migrations 20261118110000 e 20261118120000 aplicadas. Em transação.

\set fixture `cat supabase/tests/fixtures/nammux/process.finance.changed.installment.json`

begin;

set local session_replication_role = replica;
insert into public.organizations (id, name, slug) values
  ('f1000000-0000-4000-8000-0000000000b1', 'Org do contrato', 'teste-fin-a'),
  ('e1000000-0000-4000-8000-0000000000a2', 'Org B', 'teste-fin-b');
insert into public.opportunities (id, organization_id, title, pipeline_stage_id) values
  ('f6000000-0000-4000-8000-0000000000d1', 'f1000000-0000-4000-8000-0000000000b1', 'Negócio A', gen_random_uuid()),
  ('e3000000-0000-4000-8000-0000000000d2', 'e1000000-0000-4000-8000-0000000000a2', 'Negócio B', gen_random_uuid());
set local session_replication_role = origin;

-- O gancho real não faz nada; aqui ele anota cada transição para o teste conferir.
create temp table _transicoes (seq serial, kind text, external_id text, transition text, reason text) on commit drop;
create or replace function public.nammux_after_process_finance(_finance_id uuid, _transition text, _reason text)
returns void language plpgsql as $$
begin
  insert into _transicoes (kind, external_id, transition, reason)
  select f.kind, f.external_id, _transition, _reason from public.nammux_process_finance f where f.id = _finance_id;
end $$;

create function pg_temp.transicoes() returns text language sql as $$
  with t as (delete from _transicoes returning *)
  select coalesce(string_agg(transition || '@' || external_id || '/' || reason, ',' order by seq), '') from t;
$$;

create function pg_temp.acordo(_homologado date default null) returns jsonb language sql as $$
  select jsonb_build_object('id', 'ac-1', 'status', 'vigente', 'agreed_on', '2026-10-01',
                            'homologated_on', _homologado, 'installments_count', 2);
$$;
create function pg_temp.parcela(_version bigint, _status text, _paid date default null, _manif date default null,
                                _homologado date default null, _reason text default 'live')
returns jsonb language sql as $$
  select jsonb_build_object(
    'schema_version', 1, 'source', 'nammux', 'reason', _reason, 'version', _version, 'kind', 'installment',
    'seialz_opportunity_id', 'f6000000-0000-4000-8000-0000000000d1', 'external_process_id', 'proc-1',
    'agreement', pg_temp.acordo(_homologado),
    'installment', jsonb_build_object('id', 'pa-1', 'agreement_id', 'ac-1', 'number', 1, 'due_date', '2026-12-05',
      'effective_due_date', '2026-12-07', 'client_amount', 700.00, 'status', _status, 'paid_on', _paid,
      'manifestation_due_date', _manif));
$$;

select set_config('teste.fixture', :'fixture', true);

do $teste$
declare
  v_org uuid := 'f1000000-0000-4000-8000-0000000000b1';
  v_org_b uuid := 'e1000000-0000-4000-8000-0000000000a2';
  v_r jsonb; n int; v_t text; v_row public.nammux_process_finance;
begin
  -- 1. A parcela chega antes do acordo: os dois são gravados; "acordo fechado" sai uma vez.
  v_r := public.nammux_apply_process_finance(v_org, 'fin-1', pg_temp.parcela(20, 'open'), now());
  if v_r->>'status' <> 'applied' then raise exception 'FALHOU 1: %', v_r; end if;
  v_t := pg_temp.transicoes();
  if v_t <> 'agreement_closed@ac-1/live' then raise exception 'FALHOU 1: transições: %', v_t; end if;
  select count(*) into n from public.nammux_process_finance where organization_id = v_org;
  if n <> 2 then raise exception 'FALHOU 1: % linhas', n; end if;
  select * into v_row from public.nammux_process_finance where organization_id = v_org and kind = 'installment';
  if v_row.parent_external_id <> 'ac-1' or v_row.number <> 1 or v_row.client_amount <> 700 or v_row.status <> 'open'
     or v_row.due_date <> '2026-12-05' or v_row.effective_due_date <> '2026-12-07' then
    raise exception 'FALHOU 1: parcela gravada errada: %', to_jsonb(v_row);
  end if;

  -- 2. O evento do acordo (publicado antes, versão menor) chega depois: ignorado, sem transição.
  v_r := public.nammux_apply_process_finance(v_org, 'fin-0',
           jsonb_build_object('reason','live','version',10,'kind','agreement',
             'seialz_opportunity_id','f6000000-0000-4000-8000-0000000000d1','external_process_id','proc-1',
             'agreement', pg_temp.acordo()), now());
  if v_r->>'status' <> 'stale' or pg_temp.transicoes() <> '' then raise exception 'FALHOU 2: %', v_r; end if;

  -- 3. Paga: "empresa pagou" uma vez. Reentrega do mesmo evento: nada.
  v_r := public.nammux_apply_process_finance(v_org, 'fin-3', pg_temp.parcela(30, 'paid', '2026-12-04'), now());
  v_t := pg_temp.transicoes();
  if v_t <> 'installment_paid@pa-1/live' then raise exception 'FALHOU 3: %', v_t; end if;
  v_r := public.nammux_apply_process_finance(v_org, 'fin-3', pg_temp.parcela(30, 'paid', '2026-12-04'), now());
  if v_r->>'status' <> 'duplicate' or pg_temp.transicoes() <> '' then raise exception 'FALHOU 3 (reentrega): %', v_r; end if;

  -- 4. Fora de ordem: um "em aberto" mais antigo chega depois do "paga". Não vira estorno.
  v_r := public.nammux_apply_process_finance(v_org, 'fin-4', pg_temp.parcela(25, 'open'), now());
  if v_r->>'status' <> 'stale' or pg_temp.transicoes() <> '' then raise exception 'FALHOU 4: %', v_r; end if;
  if (select status from public.nammux_process_finance where organization_id = v_org and kind = 'installment') <> 'paid' then
    raise exception 'FALHOU 4: versão antiga regrediu o estado';
  end if;

  -- 5. Estorno de verdade (versão mais nova, em aberto).
  v_r := public.nammux_apply_process_finance(v_org, 'fin-5', pg_temp.parcela(40, 'open'), now());
  v_t := pg_temp.transicoes();
  if v_t <> 'payment_reversed@pa-1/live' then raise exception 'FALHOU 5: %', v_t; end if;

  -- 6. Venceu sem pagar, com o prazo de manifestação; depois foi paga.
  v_r := public.nammux_apply_process_finance(v_org, 'fin-6', pg_temp.parcela(50, 'overdue', null, '2026-12-14'), now());
  v_t := pg_temp.transicoes();
  if v_t <> 'installment_overdue@pa-1/live' then raise exception 'FALHOU 6: %', v_t; end if;
  if (select manifestation_due_date from public.nammux_process_finance where organization_id = v_org and kind = 'installment') <> '2026-12-14' then
    raise exception 'FALHOU 6: prazo de manifestação não gravado';
  end if;
  -- continua vencida em outra versão (ex.: pagamento parcial): não avisa de novo
  v_r := public.nammux_apply_process_finance(v_org, 'fin-6b', pg_temp.parcela(55, 'overdue', null, '2026-12-14'), now());
  if pg_temp.transicoes() <> '' then raise exception 'FALHOU 6: vencida avisou duas vezes'; end if;
  v_r := public.nammux_apply_process_finance(v_org, 'fin-6c', pg_temp.parcela(60, 'paid', '2026-12-10'), now());
  v_t := pg_temp.transicoes();
  if v_t <> 'installment_paid@pa-1/live' then raise exception 'FALHOU 6 (paga depois): %', v_t; end if;

  -- 7. Homologação chega dentro do evento de uma parcela: sai uma vez.
  v_r := public.nammux_apply_process_finance(v_org, 'fin-7', pg_temp.parcela(70, 'paid', '2026-12-10', null, '2026-12-11'), now());
  v_t := pg_temp.transicoes();
  if v_t <> 'agreement_homologated@ac-1/live' then raise exception 'FALHOU 7: %', v_t; end if;
  v_r := public.nammux_apply_process_finance(v_org, 'fin-7b', pg_temp.parcela(75, 'paid', '2026-12-10', null, '2026-12-11'), now());
  if pg_temp.transicoes() <> '' then raise exception 'FALHOU 7: homologação avisou duas vezes'; end if;

  -- 8. Repasse e estorno do repasse. O motivo (carga inicial) chega ao gancho.
  v_r := public.nammux_apply_process_finance(v_org, 'fin-8',
           jsonb_build_object('reason','backfill','version',80,'kind','payout',
             'seialz_opportunity_id','f6000000-0000-4000-8000-0000000000d1','external_process_id','proc-1',
             'payout', jsonb_build_object('id','rp-1','amount',700.00,'paid_on','2026-12-12','reversed',false)), now());
  v_t := pg_temp.transicoes();
  if v_t <> 'payout_done@rp-1/backfill' then raise exception 'FALHOU 8: %', v_t; end if;
  v_r := public.nammux_apply_process_finance(v_org, 'fin-8b',
           jsonb_build_object('reason','live','version',85,'kind','payout',
             'seialz_opportunity_id','f6000000-0000-4000-8000-0000000000d1','external_process_id','proc-1',
             'payout', jsonb_build_object('id','rp-1','amount',700.00,'paid_on','2026-12-12','reversed',true)), now());
  v_t := pg_temp.transicoes();
  if v_t <> 'payout_reversed@rp-1/live' then raise exception 'FALHOU 8 (estorno): %', v_t; end if;

  -- 9. Campo malformado: recusa definitiva, sem recibo e sem meio-estado
  --    (o acordo do mesmo evento também não pode ficar gravado).
  v_r := public.nammux_apply_process_finance(v_org, 'fin-x1',
           jsonb_set(jsonb_set(pg_temp.parcela(90, 'paid'), '{installment,due_date}', '"não é data"'),
                     '{agreement,installments_count}', '99'), now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 9a: %', v_r; end if;
  select count(*) into n from public.nammux_sync_events where organization_id = v_org and external_event_id = 'fin-x1';
  if n <> 0 then raise exception 'FALHOU 9a: recusa deixou recibo'; end if;
  if (select installments_count from public.nammux_process_finance where organization_id = v_org and kind = 'agreement') <> 2 then
    raise exception 'FALHOU 9a: recusa deixou o acordo meio gravado';
  end if;
  v_r := public.nammux_apply_process_finance(v_org, 'fin-x2', pg_temp.parcela(90, 'paid') || '{"kind":"outra_coisa"}', now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 9b: %', v_r; end if;
  v_r := public.nammux_apply_process_finance(v_org, 'fin-x3', pg_temp.parcela(90, 'paid') - 'agreement', now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 9c: %', v_r; end if;
  v_r := public.nammux_apply_process_finance(v_org, 'fin-x4', pg_temp.parcela(90, 'paid') || '{"version":"x"}', now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 9d: %', v_r; end if;
  if pg_temp.transicoes() <> '' then raise exception 'FALHOU 9: recusa gerou transição'; end if;

  -- 10. Negócio de outra organização.
  v_r := public.nammux_apply_process_finance(v_org_b, 'fin-b1', pg_temp.parcela(95, 'paid'), now());
  if v_r->>'status' <> 'opportunity_not_found' then raise exception 'FALHOU 10: %', v_r; end if;
  select count(*) into n from public.nammux_process_finance where organization_id = v_org_b;
  if n <> 0 then raise exception 'FALHOU 10: gravou na outra organização'; end if;

  -- 11. Contrato: o payload que o Nammux produz de verdade é aplicado sem adaptação.
  delete from public.nammux_process_finance where organization_id = v_org;
  v_r := public.nammux_apply_process_finance(v_org, 'fin-contrato', current_setting('teste.fixture')::jsonb, now());
  if v_r->>'status' <> 'applied' then raise exception 'CONTRATO QUEBRADO: %', v_r; end if;
  v_t := pg_temp.transicoes();
  if v_t <> 'agreement_closed@f8000000-0000-4000-8000-00000000000a/live,agreement_homologated@f8000000-0000-4000-8000-00000000000a/live,installment_paid@f9000000-0000-4000-8000-000000000002/live' then
    raise exception 'CONTRATO QUEBRADO: transições: %', v_t;
  end if;
  select * into v_row from public.nammux_process_finance where organization_id = v_org and kind = 'installment';
  if v_row.external_id <> 'f9000000-0000-4000-8000-000000000002'
     or v_row.parent_external_id <> 'f8000000-0000-4000-8000-00000000000a'
     or v_row.external_process_id <> 'f3000000-0000-4000-8000-0000000000a1'
     or v_row.number <> 2 or v_row.status <> 'paid' or v_row.paid_on <> '2026-12-04'
     or v_row.due_date <> '2026-12-05' or v_row.effective_due_date <> '2026-12-07'
     or v_row.client_amount <> 700.00 or v_row.manifestation_due_date is not null
     or v_row.source_version <> 1000 then
    raise exception 'CONTRATO QUEBRADO: parcela lida errada: %', to_jsonb(v_row);
  end if;
  select * into v_row from public.nammux_process_finance where organization_id = v_org and kind = 'agreement';
  if v_row.status <> 'vigente' or v_row.agreed_on <> '2026-10-01' or v_row.homologated_on <> '2026-10-08'
     or v_row.installments_count <> 6 then
    raise exception 'CONTRATO QUEBRADO: acordo lido errado: %', to_jsonb(v_row);
  end if;

  -- 12. Permissões: ninguém lê o financeiro pela tela.
  if has_table_privilege('authenticated', 'public.nammux_process_finance', 'select')
     or has_table_privilege('anon', 'public.nammux_process_finance', 'select')
     or not (select relrowsecurity from pg_class where oid = 'public.nammux_process_finance'::regclass) then
    raise exception 'FALHOU 12: tabela do financeiro exposta';
  end if;
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('nammux_apply_process_finance', 'nammux_finance_upsert')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if n <> 0 then raise exception 'FALHOU 12: % função(ões) expostas', n; end if;

  raise notice 'nammux_process_finance: OK';
end
$teste$;

rollback;
