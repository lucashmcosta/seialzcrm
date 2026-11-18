\set ON_ERROR_STOP on

-- Fila de avisos ao cliente (20261118150000_nammux_notices.sql).
-- Os avisos são planejados pelo caminho real: aplicando eventos com as mesmas
-- RPCs que o ingest chama. O que este teste existe para provar:
--   * nenhum aviso em dobro: reentrega, remarcação, cadeia de remarcações
--   * remarcou → o pendente antigo é cancelado; o que já saiu não é tocado
--   * lembretes só os que ainda cabem no tempo; dia inteiro sem lembrete de hora
--   * carga inicial não repete "foi marcada"
--   * pagamento estornado, vencida-e-paga, notícia ruim com aprovação
--   * com a flag desligada, nada é planejado
--   * reenvio com espera, encerramento, e resultado incerto que NÃO reenvia
--
-- Rodar da raiz do repositório, contra Postgres descartável com o schema do
-- Seialz e as migrations 20261118110000 a 20261118150000 aplicadas. Em transação.

begin;

set local session_replication_role = replica;
insert into public.organizations (id, name, slug) values
  ('a7000000-0000-4000-8000-0000000000a1', 'Org com avisos', 'teste-avisos-a'),
  ('a7000000-0000-4000-8000-0000000000a2', 'Org sem a flag', 'teste-avisos-b');
insert into public.contacts (id, organization_id, full_name) values
  ('a7200000-0000-4000-8000-0000000000c1', 'a7000000-0000-4000-8000-0000000000a1', 'Contato de teste'),
  ('a7200000-0000-4000-8000-0000000000c2', 'a7000000-0000-4000-8000-0000000000a2', 'Contato de teste B');
insert into public.opportunities (id, organization_id, title, pipeline_stage_id, contact_id) values
  ('a7300000-0000-4000-8000-0000000000d1', 'a7000000-0000-4000-8000-0000000000a1', 'Negócio A', gen_random_uuid(), 'a7200000-0000-4000-8000-0000000000c1'),
  ('a7300000-0000-4000-8000-0000000000d2', 'a7000000-0000-4000-8000-0000000000a2', 'Negócio B', gen_random_uuid(), 'a7200000-0000-4000-8000-0000000000c2');
insert into public.nammux_process_snapshots (organization_id, opportunity_id, external_process_id, sync_status) values
  ('a7000000-0000-4000-8000-0000000000a1', 'a7300000-0000-4000-8000-0000000000d1', 'proc-av-1', 'synced');
set local session_replication_role = origin;

-- A organização A liga os avisos; a B não.
insert into public.integration_feature_flags (flag_key, organization_id, enabled) values
  ('nammux_notices', 'a7000000-0000-4000-8000-0000000000a1', true);

create sequence pg_temp.v start 1000;

-- Aplica um evento de agenda pelo caminho real. Devolve o status da RPC.
create function pg_temp.agenda(_org uuid, _opp uuid, _ev text, _change text, _start timestamptz,
                               _extra jsonb default '{}'::jsonb, _reason text default 'live', _version bigint default null)
returns text language plpgsql as $$
declare v bigint := coalesce(_version, nextval('pg_temp.v')); r jsonb;
begin
  r := public.nammux_apply_process_event(_org, 'ev-' || _ev || '-' || v::text, jsonb_build_object(
    'schema_version', 1, 'reason', _reason, 'version', v, 'change', _change,
    'seialz_opportunity_id', _opp, 'external_process_id', 'proc-av-1',
    'event', jsonb_build_object('id', _ev, 'type', 'audiencia',
                                'status', case when _change in ('cancelled','superseded') then 'cancelado'
                                               when _change = 'completed' then 'concluido'
                                               when _change = 'no_show' then 'nao_compareceu' else 'pendente' end,
                                'start_at', _start, 'all_day', false, 'root_event_id', _ev, 'reschedule_seq', 0) || _extra), now());
  return r->>'status';
end $$;

-- Avisos de uma cadeia, "tipo=status" em ordem de envio.
create function pg_temp.avisos(_org uuid, _root text) returns text language sql as $$
  select coalesce(string_agg(kind || '=' || status, ',' order by send_at, kind), '')
    from public.nammux_notices where organization_id = _org and subject_type = 'event' and subject_root = _root;
$$;

do $teste$
declare
  v_org uuid := 'a7000000-0000-4000-8000-0000000000a1';
  v_org_b uuid := 'a7000000-0000-4000-8000-0000000000a2';
  v_opp uuid := 'a7300000-0000-4000-8000-0000000000d1';
  v_opp_b uuid := 'a7300000-0000-4000-8000-0000000000d2';
  -- 14:00 em Brasília (17:00 UTC), para os lembretes não caírem no horário de silêncio.
  v_d30 timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + 30 + time '14:00') at time zone 'America/Sao_Paulo';
  v_d40 timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + 40 + time '14:00') at time zone 'America/Sao_Paulo';
  v_d3 timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + 3 + time '14:00') at time zone 'America/Sao_Paulo';
  v_t text; n int; r record; v_id uuid; v_r jsonb; v_fin uuid;
begin
  ------------------------------------------------------------------
  -- AGENDA
  ------------------------------------------------------------------
  -- 1. Marcada a 30 dias: anúncio + 4 lembretes, nas horas certas.
  if pg_temp.agenda(v_org, v_opp, 'A', 'scheduled', v_d30) <> 'applied' then raise exception 'FALHOU 1: evento não aplicado'; end if;
  select count(*) into n from public.nammux_notices where organization_id = v_org and subject_root = 'A';
  if n <> 5 then raise exception 'FALHOU 1: esperava 5 avisos, há % (%)', n, pg_temp.avisos(v_org, 'A'); end if;
  select count(*) into n from public.nammux_notices where organization_id = v_org and subject_root = 'A' and (
       (kind = 'event_reminder_7d' and send_at = v_d30 - interval '7 days')
    or (kind = 'event_reminder_1d' and send_at = v_d30 - interval '24 hours')
    or (kind = 'event_reminder_1h' and send_at = v_d30 - interval '1 hour')
    or (kind = 'event_starting'    and send_at = v_d30 - interval '15 minutes')
    or (kind = 'event_scheduled'   and send_at <= now() + interval '13 hours'));
  if n <> 5 then raise exception 'FALHOU 1: horário de envio errado'; end if;
  if exists (select 1 from public.nammux_notices where organization_id = v_org and subject_root = 'A'
              and (contact_id <> 'a7200000-0000-4000-8000-0000000000c1' or status <> 'scheduled' or expires_at is null)) then
    raise exception 'FALHOU 1: destinatário, status ou prazo errados';
  end if;

  -- 2. O mesmo evento entregue de novo (mesmo id): nada novo.
  v_r := public.nammux_apply_process_event(v_org, 'ev-A-1000', jsonb_build_object(
    'reason', 'live', 'version', 1000, 'change', 'scheduled', 'seialz_opportunity_id', v_opp, 'external_process_id', 'proc-av-1',
    'event', jsonb_build_object('id', 'A', 'type', 'audiencia', 'status', 'pendente', 'start_at', v_d30, 'all_day', false, 'root_event_id', 'A')), now());
  if v_r->>'status' <> 'duplicate' then raise exception 'FALHOU 2: %', v_r; end if;
  -- e um reparo (outro evento, mesma data): nada novo também.
  perform pg_temp.agenda(v_org, v_opp, 'A', 'scheduled', v_d30, '{}'::jsonb, 'resync');
  select count(*) into n from public.nammux_notices where organization_id = v_org and subject_root = 'A';
  if n <> 5 then raise exception 'FALHOU 2: reentrega ou reparo criou aviso (%).', n; end if;

  -- 3. Detalhe mudou (link): nenhum aviso novo. O lembrete lê o link na hora de enviar.
  perform pg_temp.agenda(v_org, v_opp, 'A', 'details_updated', v_d30, '{"virtual_link":"https://exemplo.invalid/nova-sala"}'::jsonb);
  select count(*) into n from public.nammux_notices where organization_id = v_org and subject_root = 'A';
  if n <> 5 then raise exception 'FALHOU 3: mudança de detalhe criou aviso'; end if;

  -- 4. Um lembrete já saiu; depois a audiência é remarcada.
  update public.nammux_notices set status = 'sent', sent_at = now() where organization_id = v_org and subject_root = 'A' and kind = 'event_scheduled';
  perform pg_temp.agenda(v_org, v_opp, 'A', 'rescheduled', v_d40);
  -- o que já saiu continua "sent"; os 4 pendentes da data antiga são cancelados; nascem 1 anúncio + 4 lembretes da nova
  select count(*) filter (where status = 'sent' and kind = 'event_scheduled'),
         count(*) filter (where status = 'cancelled' and status_reason = 'superseded' and subject_start_at = v_d30),
         count(*) filter (where status = 'scheduled' and subject_start_at = v_d40),
         count(*) filter (where kind = 'event_rescheduled')
    into r from public.nammux_notices where organization_id = v_org and subject_root = 'A';
  if r <> row(1::bigint, 4::bigint, 5::bigint, 1::bigint) then raise exception 'FALHOU 4: % | %', r, pg_temp.avisos(v_org, 'A'); end if;

  -- 5. Cancelada: os pendentes somem, sai UM aviso de cancelamento; o que saiu fica.
  perform pg_temp.agenda(v_org, v_opp, 'A', 'cancelled', v_d40);
  select count(*) filter (where status = 'scheduled' and kind <> 'event_cancelled'),
         count(*) filter (where kind = 'event_cancelled' and status = 'scheduled'),
         count(*) filter (where status = 'sent')
    into r from public.nammux_notices where organization_id = v_org and subject_root = 'A';
  if r <> row(0::bigint, 1::bigint, 1::bigint) then raise exception 'FALHOU 5: % | %', r, pg_temp.avisos(v_org, 'A'); end if;

  -- 6. Marcada a 3 dias: sem lembrete de 7 dias.
  perform pg_temp.agenda(v_org, v_opp, 'B', 'scheduled', v_d3);
  v_t := pg_temp.avisos(v_org, 'B');
  if v_t not like 'event_scheduled=scheduled,event_reminder_1d=scheduled,event_reminder_1h=scheduled,event_starting=scheduled' then
    raise exception 'FALHOU 6: %', v_t;
  end if;

  -- 7. Cadeia de remarcações (linha nova no Nammux, mesma raiz): a antiga some em
  --    silêncio, a nova avisa uma vez, e não há lembrete em dobro para a mesma data.
  perform pg_temp.agenda(v_org, v_opp, 'B2', 'rescheduled', v_d30, '{"root_event_id":"B","rescheduled_from_event_id":"B","reschedule_seq":1}'::jsonb);
  perform pg_temp.agenda(v_org, v_opp, 'B', 'superseded', v_d3);
  select count(*) filter (where status = 'scheduled'), count(*) filter (where kind = 'event_rescheduled' and status = 'scheduled'),
         count(*) filter (where kind = 'event_cancelled'), count(*) filter (where status = 'cancelled')
    into r from public.nammux_notices where organization_id = v_org and subject_root = 'B';
  if r <> row(5::bigint, 1::bigint, 0::bigint, 4::bigint) then raise exception 'FALHOU 7: % | %', r, pg_temp.avisos(v_org, 'B'); end if;
  select count(*) into n from (select kind, subject_start_at from public.nammux_notices
     where organization_id = v_org and subject_root = 'B' and status = 'scheduled' group by 1, 2 having count(*) > 1) d;
  if n <> 0 then raise exception 'FALHOU 7: lembrete em dobro para a mesma data'; end if;
  -- a ordem inversa (a antiga chega como "superseded" DEPOIS) já foi coberta acima; e o
  -- evento antigo fora de ordem (versão menor) não desfaz nada:
  if pg_temp.agenda(v_org, v_opp, 'B2', 'scheduled', v_d3, '{"root_event_id":"B"}'::jsonb, 'live', 5) <> 'stale' then
    raise exception 'FALHOU 7: versão antiga não foi ignorada';
  end if;
  select count(*) into n from public.nammux_notices where organization_id = v_org and subject_root = 'B' and status = 'scheduled' and subject_start_at = v_d30;
  if n <> 5 then raise exception 'FALHOU 7: versão antiga mexeu nos avisos'; end if;

  -- 8. Concluída / não compareceu / removida: pendentes somem sem aviso.
  perform pg_temp.agenda(v_org, v_opp, 'B2', 'completed', v_d30, '{"root_event_id":"B"}'::jsonb);
  select count(*) filter (where status = 'scheduled'), count(*) filter (where kind = 'event_cancelled')
    into r from public.nammux_notices where organization_id = v_org and subject_root = 'B';
  if r <> row(0::bigint, 0::bigint) then raise exception 'FALHOU 8: %', r; end if;

  -- 9. Dia inteiro (sem hora): só 7 dias e véspera, às 10:00; nada de 1 h nem "está iniciando".
  perform pg_temp.agenda(v_org, v_opp, 'C', 'scheduled', v_d30, '{"all_day":true}'::jsonb);
  select string_agg(kind || '@' || to_char(send_at at time zone 'America/Sao_Paulo', 'HH24:MI'), ',' order by kind) into v_t
    from public.nammux_notices where organization_id = v_org and subject_root = 'C' and kind like 'event_reminder%' or (organization_id = v_org and subject_root = 'C' and kind = 'event_starting');
  if v_t <> 'event_reminder_1d@10:00,event_reminder_7d@10:00' then raise exception 'FALHOU 9: %', v_t; end if;

  -- 10. Carga inicial: lembretes sim, "foi marcada" não.
  perform pg_temp.agenda(v_org, v_opp, 'D', 'scheduled', v_d30, '{}'::jsonb, 'backfill');
  select count(*) filter (where kind like 'event_reminder%' or kind = 'event_starting'), count(*) filter (where kind in ('event_scheduled', 'event_rescheduled'))
    into r from public.nammux_notices where organization_id = v_org and subject_root = 'D';
  if r <> row(4::bigint, 0::bigint) then raise exception 'FALHOU 10: %', r; end if;

  -- 11. Organização sem a flag: o estado é gravado, nenhum aviso é planejado.
  if pg_temp.agenda(v_org_b, v_opp_b, 'Z', 'scheduled', v_d30) <> 'applied' then raise exception 'FALHOU 11: evento não aplicado'; end if;
  select count(*) into n from public.nammux_notices where organization_id = v_org_b;
  if n <> 0 then raise exception 'FALHOU 11: org sem a flag teve % aviso(s)', n; end if;

  -- 12. Regra da organização: desliga o lembrete de 7 dias e exige aprovação no cancelamento.
  insert into public.nammux_notice_rules (organization_id, kind, enabled, requires_approval) values
    (v_org, 'event_reminder_7d', false, false), (v_org, 'event_cancelled', true, true);
  perform pg_temp.agenda(v_org, v_opp, 'E', 'scheduled', v_d30);
  if exists (select 1 from public.nammux_notices where organization_id = v_org and subject_root = 'E' and kind = 'event_reminder_7d') then
    raise exception 'FALHOU 12: lembrete desligado foi criado';
  end if;
  perform pg_temp.agenda(v_org, v_opp, 'E', 'cancelled', v_d30);
  if (select status from public.nammux_notices where organization_id = v_org and subject_root = 'E' and kind = 'event_cancelled') <> 'pending_approval' then
    raise exception 'FALHOU 12: cancelamento não ficou aguardando aprovação';
  end if;

  ------------------------------------------------------------------
  -- FINANCEIRO
  ------------------------------------------------------------------
  -- 13. Paga → aviso. Estorno antes de sair → cancelado. Paga de novo → outro aviso.
  v_r := public.nammux_apply_process_finance(v_org, 'fin-av-1', jsonb_build_object(
    'reason','live','version',2000,'kind','installment','seialz_opportunity_id',v_opp,'external_process_id','proc-av-1',
    'agreement', jsonb_build_object('id','ac-av','status','vigente','agreed_on','2026-10-01','installments_count',2),
    'installment', jsonb_build_object('id','pa-av','agreement_id','ac-av','number',1,'due_date','2026-12-05','status','paid','paid_on','2026-12-04')), now());
  select id into v_fin from public.nammux_process_finance where organization_id = v_org and kind = 'installment' and external_id = 'pa-av';
  select string_agg(kind || '=' || status, ',' order by kind) into v_t from public.nammux_notices where organization_id = v_org and subject_type = 'finance';
  if v_t <> 'installment_paid=scheduled' then raise exception 'FALHOU 13: %', v_t; end if;
  v_r := public.nammux_apply_process_finance(v_org, 'fin-av-2', jsonb_build_object(
    'reason','live','version',2001,'kind','installment','seialz_opportunity_id',v_opp,'external_process_id','proc-av-1',
    'agreement', jsonb_build_object('id','ac-av','status','vigente','agreed_on','2026-10-01','installments_count',2),
    'installment', jsonb_build_object('id','pa-av','agreement_id','ac-av','number',1,'due_date','2026-12-05','status','open')), now());
  if (select status || '/' || status_reason from public.nammux_notices where subject_id = v_fin and kind = 'installment_paid') <> 'cancelled/payment_reversed' then
    raise exception 'FALHOU 13: estorno não cancelou o aviso pendente';
  end if;

  -- 14. Paga de novo e o aviso SAI; depois é estornada: vai para uma pessoa, e não é reenviável.
  v_r := public.nammux_apply_process_finance(v_org, 'fin-av-3', jsonb_build_object(
    'reason','live','version',2002,'kind','installment','seialz_opportunity_id',v_opp,'external_process_id','proc-av-1',
    'agreement', jsonb_build_object('id','ac-av','status','vigente','agreed_on','2026-10-01','installments_count',2),
    'installment', jsonb_build_object('id','pa-av','agreement_id','ac-av','number',1,'due_date','2026-12-05','status','paid','paid_on','2026-12-06')), now());
  update public.nammux_notices set status = 'sent', sent_at = now() where subject_id = v_fin and kind = 'installment_paid' and status = 'scheduled'
    returning id into v_id;
  if v_id is null then raise exception 'FALHOU 14: segundo pagamento não gerou aviso novo'; end if;
  v_r := public.nammux_apply_process_finance(v_org, 'fin-av-4', jsonb_build_object(
    'reason','live','version',2003,'kind','installment','seialz_opportunity_id',v_opp,'external_process_id','proc-av-1',
    'agreement', jsonb_build_object('id','ac-av','status','vigente','agreed_on','2026-10-01','installments_count',2),
    'installment', jsonb_build_object('id','pa-av','agreement_id','ac-av','number',1,'due_date','2026-12-05','status','open')), now());
  if (select status || '/' || status_reason from public.nammux_notices where id = v_id) <> 'needs_review/payment_reversed_after_sent' then
    raise exception 'FALHOU 14: aviso já enviado e desmentido não foi para revisão';
  end if;

  -- 15. Venceu sem pagar → aviso; paga em seguida → o "não pagou" pendente é cancelado e sai o "pagou".
  v_r := public.nammux_apply_process_finance(v_org, 'fin-av-5', jsonb_build_object(
    'reason','live','version',2010,'kind','installment','seialz_opportunity_id',v_opp,'external_process_id','proc-av-1',
    'agreement', jsonb_build_object('id','ac-av','status','vigente','agreed_on','2026-10-01','installments_count',2),
    'installment', jsonb_build_object('id','pa-av2','agreement_id','ac-av','number',2,'due_date','2026-11-05','effective_due_date','2026-11-05','status','overdue','manifestation_due_date','2026-11-12')), now());
  select id into v_fin from public.nammux_process_finance where organization_id = v_org and external_id = 'pa-av2';
  if (select status from public.nammux_notices where subject_id = v_fin and kind = 'installment_overdue') <> 'scheduled' then
    raise exception 'FALHOU 15: vencida sem aviso';
  end if;
  v_r := public.nammux_apply_process_finance(v_org, 'fin-av-6', jsonb_build_object(
    'reason','live','version',2011,'kind','installment','seialz_opportunity_id',v_opp,'external_process_id','proc-av-1',
    'agreement', jsonb_build_object('id','ac-av','status','vigente','agreed_on','2026-10-01','installments_count',2,'homologated_on','2026-11-10'),
    'installment', jsonb_build_object('id','pa-av2','agreement_id','ac-av','number',2,'due_date','2026-11-05','status','paid','paid_on','2026-11-11')), now());
  select string_agg(kind || '=' || status, ',' order by kind) into v_t from public.nammux_notices where subject_id = v_fin;
  if v_t <> 'installment_overdue=cancelled,installment_paid=scheduled' then raise exception 'FALHOU 15: %', v_t; end if;
  -- a homologação que veio junto também avisa, uma vez
  select count(*) into n from public.nammux_notices where organization_id = v_org and kind = 'agreement_homologated' and status = 'scheduled';
  if n <> 1 then raise exception 'FALHOU 15: homologação (%).', n; end if;

  -- 16. Repasse: desligado por padrão. Carga inicial: nada.
  v_r := public.nammux_apply_process_finance(v_org, 'fin-av-7', jsonb_build_object(
    'reason','live','version',2020,'kind','payout','seialz_opportunity_id',v_opp,'external_process_id','proc-av-1',
    'payout', jsonb_build_object('id','rp-av','amount',700,'paid_on','2026-11-12','reversed',false)), now());
  v_r := public.nammux_apply_process_finance(v_org, 'fin-av-8', jsonb_build_object(
    'reason','backfill','version',2021,'kind','installment','seialz_opportunity_id',v_opp,'external_process_id','proc-av-1',
    'agreement', jsonb_build_object('id','ac-av','status','vigente','agreed_on','2026-10-01','installments_count',2,'homologated_on','2026-11-10'),
    'installment', jsonb_build_object('id','pa-av3','agreement_id','ac-av','number',3,'due_date','2026-11-05','status','paid','paid_on','2026-11-11')), now());
  select count(*) into n from public.nammux_notices where organization_id = v_org and (kind = 'payout_done'
     or subject_id = (select id from public.nammux_process_finance where organization_id = v_org and external_id = 'pa-av3'));
  if n <> 0 then raise exception 'FALHOU 16: repasse desligado ou carga inicial geraram aviso'; end if;

  ------------------------------------------------------------------
  -- MOVIMENTAÇÕES E ENTREVISTA
  ------------------------------------------------------------------
  -- 17. Neutra com aviso → automática. Desfavorável → aguarda uma pessoa. Sem aviso → nada.
  v_r := public.nammux_apply_process_movement(v_org, 'mov-av-1', jsonb_build_object('reason','live','version',3000,
    'seialz_opportunity_id',v_opp,'external_process_id','proc-av-1',
    'movement', jsonb_build_object('id','m1','occurred_at',now(),'catalog_key','liquidacao','text','Começou a fase de cálculo.','tone','neutra','notify',true)), now());
  v_r := public.nammux_apply_process_movement(v_org, 'mov-av-2', jsonb_build_object('reason','live','version',3001,
    'seialz_opportunity_id',v_opp,'external_process_id','proc-av-1',
    'movement', jsonb_build_object('id','m2','occurred_at',now(),'catalog_key','sentenca_improcedente','text','Saiu a sentença.','tone','desfavoravel','notify',true)), now());
  v_r := public.nammux_apply_process_movement(v_org, 'mov-av-3', jsonb_build_object('reason','live','version',3002,
    'seialz_opportunity_id',v_opp,'external_process_id','proc-av-1',
    'movement', jsonb_build_object('id','m3','occurred_at',now(),'catalog_key','contestacao','text','A empresa apresentou a defesa.','tone','neutra','notify',false)), now());
  select string_agg(kind || '=' || status, ',' order by kind) into v_t from public.nammux_notices where organization_id = v_org and subject_type = 'movement';
  if v_t <> 'movement_unfavorable=pending_approval,movement_update=scheduled' then raise exception 'FALHOU 17: %', v_t; end if;

  -- 18. Horário de entrevista recusado → aviso na hora, para o contato do pedido.
  v_r := public.nammux_request_interview(v_org, v_opp, 'a7200000-0000-4000-8000-0000000000c1', null, v_d3);
  v_r := public.nammux_apply_interview_rejection(v_org, 'rej-av-1', jsonb_build_object(
    'seialz_opportunity_id', v_opp, 'request_key', v_r->>'request_key', 'rejection_reason', 'slot_unavailable'), now());
  select count(*) into n from public.nammux_notices
   where organization_id = v_org and kind = 'interview_slot_unavailable' and status = 'scheduled' and send_at <= now();
  if n <> 1 then raise exception 'FALHOU 18: recusa de entrevista sem aviso (%).', n; end if;

  ------------------------------------------------------------------
  -- HORÁRIO DE SILÊNCIO
  ------------------------------------------------------------------
  -- 19. 03:00 → 08:00 do mesmo dia; 21:30 → 08:00 do dia seguinte; 14:00 fica.
  if public.nammux_notice_defer('2026-12-10 03:00-03') <> '2026-12-10 08:00-03'::timestamptz
     or public.nammux_notice_defer('2026-12-10 21:30-03') <> '2026-12-11 08:00-03'::timestamptz
     or public.nammux_notice_defer('2026-12-10 14:00-03') <> '2026-12-10 14:00-03'::timestamptz
     -- adiar passaria do limite (audiência cedo no dia seguinte): sai na hora
     or public.nammux_notice_defer('2026-12-10 21:30-03', '2026-12-11 07:00-03') <> '2026-12-10 21:30-03'::timestamptz
     or public.nammux_notice_clamp('2026-12-10 06:00-03') <> '2026-12-10 08:00-03'::timestamptz
     or public.nammux_notice_clamp('2026-12-10 22:00-03') <> '2026-12-10 20:00-03'::timestamptz
     or public.nammux_notice_clamp('2026-12-10 09:30-03') <> '2026-12-10 09:30-03'::timestamptz then
    raise exception 'FALHOU 19: horário de silêncio';
  end if;

  raise notice 'nammux_notices (planejamento, 1-19): OK';
end
$teste$;

-- ============================================================
-- WORKER
-- ============================================================
do $teste$
declare
  v_org uuid := 'a7000000-0000-4000-8000-0000000000a1';
  v_id uuid; v_id2 uuid; n int; v_status text; r record;
begin
  -- Fila limpa, com três avisos: um vencido (deve sair), um futuro, um aguardando aprovação.
  delete from public.nammux_notices where organization_id = v_org;
  insert into public.nammux_notices (organization_id, contact_id, kind, subject_type, subject_id, dedup_key, send_at, expires_at, status)
  values (v_org, 'a7200000-0000-4000-8000-0000000000c1', 'movement_update', 'movement', gen_random_uuid(), 'w1', now() - interval '1 minute', now() + interval '2 hours', 'scheduled')
  returning id into v_id;
  insert into public.nammux_notices (organization_id, contact_id, kind, subject_type, subject_id, dedup_key, send_at, status)
  values (v_org, 'a7200000-0000-4000-8000-0000000000c1', 'movement_update', 'movement', gen_random_uuid(), 'w2', now() + interval '1 hour', 'scheduled'),
         (v_org, 'a7200000-0000-4000-8000-0000000000c1', 'movement_unfavorable', 'movement', gen_random_uuid(), 'w3', now() - interval '1 minute', 'pending_approval');

  -- 20. Só o vencido e liberado é reivindicado; quem já foi reivindicado não sai de novo.
  select count(*) into n from public.nammux_claim_notices(10);
  if n <> 1 then raise exception 'FALHOU 20: reivindicou %', n; end if;
  select count(*) into n from public.nammux_claim_notices(10);
  if n <> 0 then raise exception 'FALHOU 20: reivindicou o mesmo aviso duas vezes'; end if;
  if (select status || '/' || attempts from public.nammux_notices where id = v_id) <> 'sending/1' then raise exception 'FALHOU 20: status'; end if;

  -- 21. Falha definida: volta para a fila com espera de 1, 5, 15, 60 min; na 5ª encerra.
  if public.nammux_notice_finish(v_id, 'retry', 'provedor recusou') <> 'scheduled' then raise exception 'FALHOU 21: 1ª'; end if;
  select next_attempt_at into r from public.nammux_notices where id = v_id;
  if r.next_attempt_at not between now() + interval '50 seconds' and now() + interval '70 seconds' then raise exception 'FALHOU 21: espera da 1ª'; end if;
  select count(*) into n from public.nammux_claim_notices(10);
  if n <> 0 then raise exception 'FALHOU 21: reivindicou antes da espera'; end if;
  for i in 2..4 loop
    update public.nammux_notices set status = 'sending', attempts = i where id = v_id;
    if public.nammux_notice_finish(v_id, 'retry', 'provedor recusou') <> 'scheduled' then raise exception 'FALHOU 21: tentativa %', i; end if;
  end loop;
  if (select next_attempt_at from public.nammux_notices where id = v_id) not between now() + interval '59 minutes' and now() + interval '61 minutes' then
    raise exception 'FALHOU 21: espera da 4ª';
  end if;
  update public.nammux_notices set status = 'sending', attempts = 5 where id = v_id;
  if public.nammux_notice_finish(v_id, 'retry', 'provedor recusou') <> 'dead_letter' then raise exception 'FALHOU 21: 5ª não encerrou'; end if;

  -- 22. Reenvio não passa do prazo: se a espera cair depois de expirar, encerra como expirado.
  update public.nammux_notices set status = 'sending', attempts = 4, expires_at = now() + interval '10 minutes' where id = v_id;
  if public.nammux_notice_finish(v_id, 'retry', 'provedor recusou') <> 'expired' then raise exception 'FALHOU 22'; end if;

  -- 23. Enviado. Resultado atrasado de outra tentativa não altera nada.
  update public.nammux_notices set status = 'sending', attempts = 1, expires_at = now() + interval '2 hours' where id = v_id;
  if public.nammux_notice_finish(v_id, 'sent', null, 'whatsapp_template', null) <> 'sent' then raise exception 'FALHOU 23'; end if;
  if public.nammux_notice_finish(v_id, 'retry', 'tarde demais') is not null then raise exception 'FALHOU 23: resultado atrasado alterou aviso enviado'; end if;
  if (select status || '/' || channel from public.nammux_notices where id = v_id) <> 'sent/whatsapp_template' then raise exception 'FALHOU 23: status'; end if;

  -- 24. Caiu no meio do envio (resultado incerto): NÃO volta para a fila; vai para uma pessoa.
  insert into public.nammux_notices (organization_id, contact_id, kind, subject_type, subject_id, dedup_key, send_at, status, locked_at, attempts)
  values (v_org, 'a7200000-0000-4000-8000-0000000000c1', 'movement_update', 'movement', gen_random_uuid(), 'w4', now() - interval '10 minutes', 'sending', now() - interval '6 minutes', 1)
  returning id into v_id2;
  -- e um que passou do prazo sem sair
  insert into public.nammux_notices (organization_id, contact_id, kind, subject_type, subject_id, dedup_key, send_at, expires_at, status)
  values (v_org, 'a7200000-0000-4000-8000-0000000000c1', 'event_starting', 'event', gen_random_uuid(), 'w5', now() - interval '1 hour', now() - interval '30 minutes', 'scheduled');
  perform public.nammux_notice_reap();
  if (select status || '/' || status_reason from public.nammux_notices where id = v_id2) <> 'needs_review/unknown_outcome' then
    raise exception 'FALHOU 24: resultado incerto não foi para revisão';
  end if;
  select count(*) into n from public.nammux_claim_notices(10);
  if n <> 0 then raise exception 'FALHOU 24: aviso de resultado incerto ou vencido voltou para a fila'; end if;
  if (select status from public.nammux_notices where dedup_key = 'w5' and organization_id = v_org) <> 'expired' then
    raise exception 'FALHOU 24: aviso fora do prazo não expirou';
  end if;

  -- 25. Aprovação: sem usuário com permissão, recusa.
  begin
    perform public.nammux_notice_decide((select id from public.nammux_notices where dedup_key = 'w3' and organization_id = v_org), true);
    raise exception 'FALHOU 25: aprovou sem permissão';
  exception when insufficient_privilege then null;
  end;

  raise notice 'nammux_notices (worker, 20-25): OK';
end
$teste$;

-- A partir daqui, como se quem chama tivesse a permissão de Atendimentos.
create or replace function public.nammux_can_manage_notices(_organization_id uuid)
returns boolean language sql as $$ select true $$;

do $teste$
declare
  v_org uuid := 'a7000000-0000-4000-8000-0000000000a1';
  v_w3 uuid := (select id from public.nammux_notices where dedup_key = 'w3' and organization_id = 'a7000000-0000-4000-8000-0000000000a1');
  v_w4 uuid := (select id from public.nammux_notices where dedup_key = 'w4' and organization_id = 'a7000000-0000-4000-8000-0000000000a1');
  v_id uuid; n int;
begin
  -- 26. Aprovar → entra na fila para sair agora. Recusar → não sai. Decidir duas vezes → erro.
  if public.nammux_notice_decide(v_w3, true) <> 'scheduled' then raise exception 'FALHOU 26: aprovar'; end if;
  select count(*) into n from public.nammux_claim_notices(10);
  if n <> 1 then raise exception 'FALHOU 26: aprovado não foi para a fila'; end if;
  if public.nammux_notice_decide(v_w4, false, 'cliente já foi avisado por telefone') <> 'rejected' then raise exception 'FALHOU 26: recusar'; end if;
  begin
    perform public.nammux_notice_decide(v_w4, true);
    raise exception 'FALHOU 26: decidiu duas vezes';
  exception when invalid_parameter_value then null;
  end;

  -- 27. Aprovar depois do prazo → expira, não sai. Aviso desmentido não é reenviável.
  insert into public.nammux_notices (organization_id, contact_id, kind, subject_type, subject_id, dedup_key, send_at, expires_at, status)
  values (v_org, 'a7200000-0000-4000-8000-0000000000c1', 'movement_unfavorable', 'movement', gen_random_uuid(), 'w6', now() - interval '2 days', now() - interval '1 day', 'pending_approval')
  returning id into v_id;
  if public.nammux_notice_decide(v_id, true) <> 'expired' then raise exception 'FALHOU 27: aprovou fora do prazo'; end if;
  insert into public.nammux_notices (organization_id, contact_id, kind, subject_type, subject_id, dedup_key, send_at, status, status_reason)
  values (v_org, 'a7200000-0000-4000-8000-0000000000c1', 'installment_paid', 'finance', gen_random_uuid(), 'w7', now(), 'needs_review', 'payment_reversed_after_sent')
  returning id into v_id;
  begin
    perform public.nammux_notice_decide(v_id, true);
    raise exception 'FALHOU 27: reenviou aviso desmentido';
  exception when invalid_parameter_value then null;
  end;
  if public.nammux_notice_decide(v_id, false, 'ciente') <> 'rejected' then raise exception 'FALHOU 27: dar baixa'; end if;

  -- 28. Permissões.
  if has_table_privilege('authenticated', 'public.nammux_notices', 'select') or has_table_privilege('anon', 'public.nammux_notices', 'select')
     or has_table_privilege('authenticated', 'public.nammux_notice_rules', 'select') then
    raise exception 'FALHOU 28: tabelas da fila legíveis fora do service_role';
  end if;
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('nammux_claim_notices', 'nammux_notice_finish', 'nammux_notice_reap', 'nammux_notice_enqueue',
                       'nammux_plan_event_notices', 'nammux_notice_rule', 'nammux_notice_defer', 'nammux_notice_clamp')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if n <> 0 then raise exception 'FALHOU 28: % função(ões) do worker expostas', n; end if;
  if has_function_privilege('anon', 'public.nammux_notice_decide(uuid,boolean,text)', 'execute') then
    raise exception 'FALHOU 28: aprovação exposta a anon';
  end if;

  raise notice 'nammux_notices (aprovação, 26-28): OK';
end
$teste$;

rollback;
