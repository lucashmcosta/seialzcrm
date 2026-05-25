-- =====================================================================
-- Inbox v2 — Queries de validação (pré e pós deploy)
-- Todas READ-ONLY.
-- =====================================================================

-- ============ §pre — rodar IMEDIATAMENTE antes da janela ============

-- Long-running transactions
select pid, now()-xact_start as duracao, state, left(query,200) q
  from pg_stat_activity
 where xact_start is not null and now()-xact_start > interval '1 minute'
   and pid <> pg_backend_pid();
-- Esperado: 0 linhas

-- Tamanho atual (registrar para baseline)
select pg_size_pretty(pg_total_relation_size('public.integration_inbound_events')) total,
       (select count(*) from public.integration_inbound_events) linhas;

-- Locks na tabela
select mode, count(*) from pg_locks l
  where l.relation = 'public.integration_inbound_events'::regclass
  group by mode;

-- ============ §schema — após 01_phase0_a ============

select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='integration_inbound_events'
   and column_name in ('event_version','trace_id','aggregate_id','sequence_number',
                       'signature_valid','handler_key','shadow_mode','retry_count',
                       'max_attempts','next_run_at','claimed_at','error_classification',
                       'dead_letter_reason','replay_count','correlation_id',
                       'aggregate_type','signature_algo','source_ip','headers','claimed_by')
 order by 1;
-- Esperado: 20 linhas

select 'handlers' tbl, count(*) from public.integration_inbound_handlers
union all select 'flags', count(*) from public.integration_feature_flags
union all select 'dla',   count(*) from public.integration_inbound_dead_letter_archive
union all select 'dry',   count(*) from public.integration_inbound_dry_run_log
union all select 'errs',  count(*) from public.integration_inbound_ingest_errors;
-- Esperado: handlers=0, flags=4, demais=0

select flag_key, organization_id, enabled from public.integration_feature_flags
 where flag_key like 'inbox_v2.%' order by 1;
-- Esperado: 4 flags, todas enabled=false, org=null

-- ============ §indexes — após 02_phase0_b ============

select indexrelid::regclass indice, indisvalid, indisready
  from pg_index
 where indrelid in (
   'public.integration_inbound_events'::regclass,
   'public.integration_inbound_ingest_errors'::regclass,
   'public.integration_inbound_dry_run_log'::regclass,
   'public.integration_inbound_dead_letter_archive'::regclass,
   'public.integration_feature_flags'::regclass
 ) and not indisvalid;
-- Esperado: 0 linhas (nenhum índice INVALID)

-- ============ §functions — após 03_phase0_c ============

select fn_feature_flag_enabled('inbox_v2.ingest.suvsign', null);
-- Esperado: false

select * from fn_inbound_health_summary(interval '1 hour') limit 5;
-- Esperado: executa sem erro

select fn_inbound_reap_stuck(interval '5 minutes');
-- Esperado: 0 (ninguém em processing ainda)

select fn_inbound_expire(interval '30 days');
-- Esperado: 0 (TTL não atinge nada novo agora)

-- ============ §phase1_monitoring — após shadow ligada ============

-- Erros de ingest nas últimas 24h
select count(*) erros_24h from public.integration_inbound_ingest_errors
 where integration_slug='suvsign' and created_at > now() - interval '24 hours';
-- Esperado: 0

-- Paridade contagem por hora (comparar com baseline pré-deploy)
select date_trunc('hour', received_at) h, count(*) ingeridos
  from public.integration_inbound_events
 where integration_slug='suvsign' and received_at > now() - interval '24h'
 group by 1 order by 1;

-- Duplicatas reais (deve ser 0; unique constraint protege)
select external_id, count(*) c
  from public.integration_inbound_events
 where integration_slug='suvsign'
   and external_id is not null
   and received_at > now() - interval '24h'
 group by 1 having count(*) > 1;

-- Validação de assinatura
select count(*) filter (where signature_valid is null)  sem_validacao,
       count(*) filter (where signature_valid is false) invalidos,
       count(*) filter (where signature_valid is true)  validos
  from public.integration_inbound_events
 where integration_slug='suvsign' and received_at > now() - interval '24h';
