# Inbox v2 — Plano Revisado: Pré-Deploy + Fase 0 + Fase 1

Ajustes aplicados:
- **Fase 2** reescrita como **dry-run/compare-only** antes de qualquer escrita real (detalhada quando chegarmos lá; aqui consta apenas o princípio).
- **Fase 1** com observability obrigatória em falhas de insert na Inbox.
- Nova seção **Pré-Deploy** antes da Fase 0.

Este documento cobre **apenas** Pré-Deploy + Fase 0 + Fase 1, conforme solicitado. Fases 2–4 permanecem no plano anterior com o ajuste de princípio: **Fase 2 nunca escreve em tabelas reais; apenas compara o que faria vs o que o legado fez**, gravando o diff em `integration_inbound_dry_run_log`. Liberação de escrita real só após nova flag `inbox_v2.write.suvsign` e aprovação explícita.

---

## Pré-Deploy — Checklist obrigatório (antes da Fase 0)

Bloqueante. Nada de Fase 0 antes de TODOS os itens marcados.

### Operacional
- [ ] **Snapshot/backup** do banco confirmado pela equipe Supabase (PITR habilitado + snapshot manual no painel imediatamente antes da migration).
- [ ] **Janela de deploy** fora do horário comercial BR (sugestão: 22h–02h dia útil, evitar segundas e sextas).
- [ ] **Comunicação** prévia ao time de operação/suporte com janela e canal de incidente definido.
- [ ] **Responsável on-call** designado para a janela.
- [ ] **Rollback SQL pronto e revisado** (arquivo separado, ver abaixo).

### Diagnóstico de banco (queries read-only a rodar antes)
```sql
-- Tamanho atual da tabela e índices
select pg_size_pretty(pg_total_relation_size('public.integration_inbound_events')) total,
       pg_size_pretty(pg_relation_size('public.integration_inbound_events')) tabela,
       pg_size_pretty(pg_indexes_size('public.integration_inbound_events')) indices,
       (select reltuples::bigint from pg_class where relname='integration_inbound_events') linhas_estimadas;

-- Locks ativos na tabela
select pid, mode, granted, query_start, left(query,120)
  from pg_locks l join pg_stat_activity a using (pid)
 where relation = 'public.integration_inbound_events'::regclass;

-- Versão do Postgres (defaults sem reescrita exigem 11+)
select version();

-- Long-running transactions que poderiam bloquear DDL
select pid, now()-xact_start as duracao, state, left(query,120)
  from pg_stat_activity
 where xact_start is not null and now()-xact_start > interval '1 minute';
```

### Estimativa de lock das migrations
- **`ADD COLUMN ... DEFAULT <constante>`** (Postgres 11+): metadata-only, lock `ACCESS EXCLUSIVE` de milissegundos. ✅ seguro.
- **`ADD COLUMN ... DEFAULT <volátil>`** (ex.: `now()`): reescreve tabela. ❌ proibido nesta fase.
- **`CREATE UNIQUE INDEX`**: bloqueia writes. ❌ usar **`CREATE UNIQUE INDEX CONCURRENTLY`** se a tabela tiver > 100k linhas ou > 100MB.
- **`ADD CONSTRAINT ... UNIQUE USING INDEX`** após índice concorrente: lock curto.

### Decisão de CONCURRENTLY
Regra: se `linhas_estimadas > 100.000` OU `pg_total_relation_size > 100MB` → **todos os índices novos devem ser `CONCURRENTLY` em migration separada** (não pode estar em transação, exige `statement_timeout` alto).

### Rollback SQL documentado (arquivo `supabase/migrations/<timestamp>_inbox_v2_phase0_ROLLBACK.sql`, não executado, apenas versionado)
```sql
-- Reverter Fase 0. Seguro porque nada em produção consome ainda.
drop function if exists fn_inbound_health_summary(interval);
drop function if exists fn_inbound_schedule_retry(uuid, text, text);
drop function if exists fn_inbound_reap_stuck(interval);
drop function if exists fn_inbound_expire(interval);
drop function if exists fn_inbound_replay(uuid);
drop function if exists fn_inbound_archive_dead_letter(uuid);
drop function if exists fn_feature_flag_enabled(text, uuid);
drop function if exists rpc_claim_inbound_events(int, text);

drop table if exists integration_inbound_dead_letter_archive;
drop table if exists integration_inbound_dry_run_log;  -- preparado p/ Fase 2
drop table if exists integration_feature_flags;
drop table if exists integration_inbound_handlers;

drop index concurrently if exists idx_iie_provider_external_id;
drop index concurrently if exists idx_iie_idem_key;
drop index concurrently if exists idx_iie_status_next_run;
drop index concurrently if exists idx_iie_aggregate;
drop index concurrently if exists idx_iie_org_received;
drop index concurrently if exists idx_iie_claimed_processing;

alter table integration_inbound_events
  drop column if exists event_version,
  drop column if exists trace_id,
  drop column if exists correlation_id,
  drop column if exists aggregate_type,
  drop column if exists aggregate_id,
  drop column if exists sequence_number,
  drop column if exists signature_valid,
  drop column if exists signature_algo,
  drop column if exists source_ip,
  drop column if exists headers,
  drop column if exists retry_count,
  drop column if exists max_attempts,
  drop column if exists next_run_at,
  drop column if exists claimed_at,
  drop column if exists claimed_by,
  drop column if exists error_classification,
  drop column if exists dead_letter_reason,
  drop column if exists replay_count,
  drop column if exists handler_key,
  drop column if exists shadow_mode;
```

### Critérios de "go" para Fase 0
- Tabela `integration_inbound_events` < 1M linhas OU plano de `CONCURRENTLY` aprovado.
- Zero long-running transactions no momento do deploy.
- Snapshot confirmado nos últimos 15min.
- Rollback testado mentalmente pelo on-call.

---

## Fase 0 — Infra sem efeito colateral (revisada)

Objetivo inalterado: criar esqueleto Inbox v2 inerte.

### Migrations (dividir em 3 arquivos)

**`<ts>_inbox_v2_phase0_a_schema.sql`** — DDL transacional, rápida:
- `ALTER TABLE integration_inbound_events ADD COLUMN ...` (todas as colunas com default constante ou `NULL`, conforme plano anterior).
- `CREATE TABLE integration_inbound_handlers`.
- `CREATE TABLE integration_feature_flags` (seed das 3 flags `inbox_v2.ingest.suvsign`, `inbox_v2.dispatch.suvsign`, `inbox_v2.cutover.suvsign`, todas `enabled=false`).
- `CREATE TABLE integration_inbound_dead_letter_archive`.
- `CREATE TABLE integration_inbound_dry_run_log` (preparada para Fase 2; ver schema abaixo).
- RLS habilitada com policy restritiva (somente service_role); admin UI usa RPCs específicas.

**`<ts>_inbox_v2_phase0_b_indexes.sql`** — fora de transação, `CONCURRENTLY`:
- Todos os índices listados no plano anterior, decididos pela regra Pré-Deploy.

**`<ts>_inbox_v2_phase0_c_functions.sql`** — funções e RPCs (transacional):
- `rpc_claim_inbound_events`, `fn_inbound_*`, `fn_feature_flag_enabled`.
- `SECURITY DEFINER`, `SET search_path = public`.

### Schema `integration_inbound_dry_run_log` (para Fase 2)
- `id uuid pk`, `inbound_event_id uuid fk`, `provider text`, `handler_key text`, `event_version int`
- `intended_actions jsonb` (ex.: `[{op:'insert', table:'attachments', key:'...', payload:{...}}]`)
- `legacy_actual jsonb` (snapshot dos efeitos reais do legado para comparação)
- `diff_summary jsonb` (campos faltando/excedentes/divergentes)
- `outcome text check in ('match','divergent','legacy_missing','v2_extra','error')`
- `trace_id uuid`, `created_at timestamptz default now()`
- Índices: `(provider, outcome, created_at)`, `(inbound_event_id)`.

### Edge functions criadas, inertes
Mesmo do plano anterior. `inbox-health` pode ser exposta como read-only desde já.

### Riscos
- Migration `b` (índices) não roda em transação; se cair no meio, índices ficam `INVALID`. Mitigação: query de verificação `select indexname, indisvalid from pg_index ...` e `REINDEX CONCURRENTLY` se necessário.
- Seed das feature flags com `enabled=false` é seguro mesmo se nada consumir.

### Critérios de sucesso
- Migrations aplicam em < 30s cada (a/c) e índices terminam sem `INVALID`.
- `select * from fn_inbound_health_summary(interval '1 hour')` retorna sem erro.
- `select fn_feature_flag_enabled('inbox_v2.ingest.suvsign', null)` retorna `false`.

### Queries de validação
```sql
-- Colunas presentes
select column_name, data_type, column_default
  from information_schema.columns
 where table_name='integration_inbound_events'
   and column_name in ('event_version','trace_id','aggregate_id','sequence_number',
                       'signature_valid','handler_key','shadow_mode');

-- Índices válidos
select indexrelid::regclass, indisvalid, indisready
  from pg_index where indrelid='public.integration_inbound_events'::regclass;

-- Flags semeadas
select flag_key, enabled from integration_feature_flags
 where flag_key like 'inbox_v2.%' order by 1;

-- Handlers registry vazio (esperado)
select count(*) from integration_inbound_handlers;
```

---

## Fase 1 — Shadow mode SuvSign (revisada: observability obrigatória)

Objetivo inalterado: ingest paralelo na Inbox v2 com `shadow_mode=true`, **sem** desviar nada do fluxo legado.

### Mudanças em `supabase/functions/suvsign-webhook/index.ts`
Adicionar após validação HMAC, antes do processamento legado:

```ts
// Inbox v2 shadow ingest — best-effort, NUNCA quebra legado, SEMPRE loga falha
const traceId = crypto.randomUUID();
const externalId = payload.data?.document?.id ?? payload.event_id ?? null;
const inboxCtx = { traceId, provider: "suvsign", externalId, eventType: payload.event };

try {
  if (await featureFlagEnabled("inbox_v2.ingest.suvsign", orgId)) {
    const { error } = await supabase
      .from("integration_inbound_events")
      .insert({ /* campos conforme spec Fase 0 */ })
      .select("id")
      .maybeSingle();

    if (error && error.code !== "23505" /* unique_violation = duplicata esperada */) {
      // Log estruturado obrigatório — NÃO engolir
      console.error(JSON.stringify({
        level: "error",
        msg: "inbox_v2.shadow_insert_failed",
        trace_id: traceId,
        provider: "suvsign",
        external_id: externalId,
        event_type: payload.event,
        organization_id: orgId,
        pg_code: error.code,
        pg_detail: error.details,
        pg_message: error.message,
      }));
      // Métrica opcional via tabela leve de incidentes:
      await supabase.from("integration_inbound_ingest_errors").insert({
        trace_id: traceId, provider: "suvsign", external_id: externalId,
        event_type: payload.event, organization_id: orgId,
        error_code: error.code, error_message: error.message,
      }).then(() => {}, () => {}); // melhor esforço só nesta segunda tentativa
    }
  }
} catch (e) {
  console.error(JSON.stringify({
    level: "error",
    msg: "inbox_v2.shadow_insert_exception",
    trace_id: traceId,
    provider: "suvsign",
    external_id: externalId,
    event_type: payload.event,
    organization_id: orgId,
    exception: String(e),
    stack: (e as Error)?.stack?.slice(0, 2000),
  }));
}
// Fluxo legado continua intacto a partir daqui.
```

### Nova tabela de suporte (incluir em Fase 0)
`integration_inbound_ingest_errors`:
- `id uuid pk`, `trace_id uuid`, `provider text`, `external_id text`, `event_type text`
- `organization_id uuid`, `error_code text`, `error_message text`
- `created_at timestamptz default now()`
- Índice: `(provider, created_at desc)`
- RLS: service_role + admin read.
- **Adicionar à migration `phase0_a_schema.sql`** para que Fase 1 não dependa de nova migration.

### Helper `_shared/feature-flags.ts`
- `featureFlagEnabled(key, orgId)` com cache em memória do isolate (TTL 60s) para evitar lookup por request.
- Resolução: row org-específica > row global > `false`.

### Cron de TTL (ligar nesta fase)
- `inbox-expiry` agendado 1h em 1h: `select fn_inbound_expire(interval '30 days')` apenas marca `process_status='expired'`, nunca deleta.

### Tabelas/RPCs afetadas
- `integration_inbound_events` (INSERT)
- `integration_inbound_ingest_errors` (INSERT em caso de falha)
- `integration_feature_flags` (SELECT)

### Riscos
- Latência extra no webhook. Mitigação: flag cache; insert é single-row sem await fora do try.
- Crescimento de tabela. Mitigação: TTL 30d via expiry cron (marca `expired`, não deleta).
- Inundação de `integration_inbound_ingest_errors` se houver bug. Mitigação: índice + alerta `count > 50/hora` deve disparar revisão.

### Rollback
- `update integration_feature_flags set enabled=false where flag_key='inbox_v2.ingest.suvsign'` — efeito no próximo invoke (até 60s pelo cache).
- Em emergência: revert do edge function `suvsign-webhook` para versão anterior.

### Critérios de sucesso (mín. 48h em shadow)
- `integration_inbound_ingest_errors` registra **zero** erros novos relacionados a SuvSign.
- Contagem de eventos Inbox ≈ contagem de invocações legadas (tolerância < 1%).
- p95 latência do webhook não regride > 50ms vs baseline pré-deploy.
- Zero erro 5xx adicional no `suvsign-webhook`.

### Queries de validação
```sql
-- Erros de ingest (deve ser zero)
select count(*) from integration_inbound_ingest_errors
 where provider='suvsign' and created_at > now() - interval '24 hours';

-- Paridade contagem
select date_trunc('hour', received_at) h, count(*) ingeridos
  from integration_inbound_events
 where provider='suvsign' and received_at > now() - interval '24h'
 group by 1 order by 1;

-- Duplicatas reais (deve ser 0; unique constraint protege)
select external_id, count(*) from integration_inbound_events
 where provider='suvsign' group by 1 having count(*) > 1;

-- Eventos sem signature_valid (auditoria)
select count(*) filter (where signature_valid is null) sem_validacao,
       count(*) filter (where signature_valid is false) invalidos,
       count(*) filter (where signature_valid is true) validos
  from integration_inbound_events
 where provider='suvsign' and received_at > now() - interval '24h';

-- TTL funcionando
select process_status, count(*) from integration_inbound_events
 where provider='suvsign' group by 1;
```

---

## Princípio Fase 2 (apenas registro; detalhamento posterior)

Fase 2 **não escreve** em `attachments`, `activities` ou qualquer tabela de domínio. O dispatcher:
1. Reivindica evento, resolve handler v2.
2. Calcula **`intended_actions`** (o que faria se executasse).
3. Captura **`legacy_actual`** consultando o que o webhook legado já gravou (por `opportunity_id` + janela temporal).
4. Compara e grava em `integration_inbound_dry_run_log` com `outcome`.
5. Marca evento como `processed_dry_run` (status novo, não interfere em estatísticas de `processed`).

Liberação de escrita real só após:
- ≥ 95% de `outcome='match'` em 7 dias contínuos.
- Análise manual de 100% dos `divergent`.
- Nova flag `inbox_v2.write.suvsign` criada e aprovada.

---

## Próximo passo
Aprovar este plano revisado → eu gero (a) as queries de pré-deploy para você rodar agora, e (b) as 3 migrations da Fase 0 (a/b/c) + rollback, ainda sem aplicar.
