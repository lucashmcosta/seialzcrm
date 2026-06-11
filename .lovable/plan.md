
# Patch mínimo — integration-inbound-dispatcher

## Escopo
Apenas `supabase/functions/integration-inbound-dispatcher/index.ts`. Nenhuma alteração em webhook legado, `messages`, `message_threads`, `process_status`, cron ou flag permanente.

## Ajuste obrigatório aplicado
O CHECK de `integration_inbound_dry_run_log.outcome` aceita somente: `match`, `divergent`, `legacy_missing`, `v2_extra`, `error`.

Portanto:
- `v2_parse_error` e `unsupported_event_type` **não** serão gravados em `outcome`.
- Ambos serão mapeados para `outcome = "error"` no insert.
- O detalhe é preservado em `diff_summary.error_type` (`"v2_parse_error"` | `"unsupported_event_type"` | `"postgrest_lookup_failed"`).
- Contadores em memória (resposta da função) continuam separados por tipo para visibilidade no retorno do batch, mas só `error` vai para o banco.

## Mudanças no arquivo

### 1. Tipo `LegacyMessage`
- `message_thread_id: string` → `thread_id: string`
- `body: string | null` → `content: string | null`

### 2. SELECT_COLS dos lookups
- De: `id, message_thread_id, direction, body, whatsapp_message_sid, organization_id, created_at`
- Para: `id, thread_id, direction, content, whatsapp_message_sid, organization_id, created_at`

### 3. Tratamento explícito de erro PostgREST
No bloco de lookup por `whatsapp_message_sid`:
- Capturar `{ data, error }`.
- Se `error` (com `code`/`message`): NÃO marcar `legacy_missing`. Definir `outcome = "error"`, popular `diff_summary = { error_type: "postgrest_lookup_failed", pg_code, pg_message, sid_used }`.
- Se `data` vazio sem erro: mantém `legacy_missing` (comportamento legítimo).

### 4. `buildDiff`
- `legacy.body` → `legacy.content`
- Campo de diff `message_thread_id` → `thread_id`

### 5. Mapeamento de outcome antes do insert
Função auxiliar `persistOutcome(outcome, diffSummary)`:
```
const PERSISTED = new Set(["match","divergent","legacy_missing","v2_extra","error"]);
if (!PERSISTED.has(outcome)) {
  diffSummary = { ...(diffSummary ?? {}), error_type: outcome };
  outcome = "error";
}
```
Aplicado em todos os caminhos (`v2_parse_error`, `unsupported_event_type`, lookup error).

### 6. Contadores
Adicionar `error: 0` e manter `v2_parse_error` / `unsupported_event_type` apenas como contadores in-memory (retornados no JSON da resposta), não no DB.

## SQL de cleanup (apenas 6 registros de teste)
```sql
DELETE FROM integration_inbound_dry_run_log
 WHERE handler_key = 'twilio.whatsapp.parity_check.v1'
   AND inbound_event_id IN (
     -- 5 IDs do batch_size=5 + 1 prévio identificado
     '<id1>','<id2>','<id3>','<id4>','<id5>','22b7b5b9-5797-4075-93f0-bd0c2453886e'
   );

DELETE FROM integration_inbound_event_claims
 WHERE handler_key = 'twilio.whatsapp.parity_check.v1'
   AND inbound_event_id IN ( ...mesmos 6 IDs... );
```
Os 5 IDs exatos serão lidos via `read_query` no início do build, para garantir match.

## Revalidação batch_size=5
1. `UPDATE integration_feature_flags SET enabled=true WHERE flag_key='inbox_v2.dispatch.twilio-whatsapp' AND organization_id IS NULL`
2. Aguardar ~2s de propagação
3. `POST integration-inbound-dispatcher {"batch_size":5}`
4. `UPDATE ... SET enabled=false` imediatamente
5. Ler `dry_run_log` dos 5 eventos: `outcome`, `diff_summary`, `source_event`, SID usado.

### Esperado
- 3 `match` (SIDs reais já confirmados em `messages`)
- 2 `legacy_missing` (SIDs sintéticos `SMtest_*`)
- 0 `error` (se houver, o `diff_summary.error_type` indicará a causa)
- `messages` / `message_threads` inalterados
- `process_status` permanece `received`

## Fora de escopo (apenas reportar)
- 43% dos shadow events com `organization_id` null — precisa plano de cutover separado.
- Política de limpeza de claims pós-replay (decidir depois).
