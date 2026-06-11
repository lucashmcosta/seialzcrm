## Objetivo
Executar 2 rodadas adicionais de validação read-only do `integration-inbound-dispatcher` para aumentar a confiança na paridade em eventos recentes saudáveis. Sem cron, sem backfill, sem alteração de webhook/messages/process_status.

## Filtros (idênticos à rodada aprovada)
- integration_slug = `twilio-whatsapp`
- shadow_mode = true
- process_status = `received`
- organization_id IS NOT NULL
- received_at > `2026-05-25T19:31:40Z`
- source_event = `inbound_message`
- MessageSid NOT LIKE `SMtest_%`
- exclusão de eventos já presentes em `integration_inbound_dry_run_log` para `handler_key = twilio.whatsapp.parity_check.v1` (já implementado no dispatcher)

## Procedimento por rodada (executar 2x, sequencial)

Para cada rodada R ∈ {1, 2}:

1. **Snapshot pré-rodada** — registrar `max(created_at)` atual em `integration_inbound_dry_run_log` para o handler, para isolar as linhas novas dessa rodada.
2. **Ligar flag** — `UPDATE integration_feature_flags SET enabled=true, updated_at=now() WHERE flag_key='inbox_v2.dispatch.twilio-whatsapp' AND organization_id IS NULL`.
3. **Invocar 1x** — `POST integration-inbound-dispatcher` com:
   ```json
   {
     "batch_size": 50,
     "filters": {
       "organization_id_not_null": true,
       "source_event": "inbound_message",
       "received_after": "2026-05-25T19:31:40Z",
       "exclude_message_sid_prefix": "SMtest_"
     }
   }
   ```
   (Mesmo timeout esperado da rodada anterior; resultados são lidos via DB, não pela resposta HTTP.)
4. **Desligar flag imediatamente** — `UPDATE ... SET enabled=false`. Confirmar `enabled=false` com SELECT.
5. **Coletar outcomes** — agregar por `outcome` em `integration_inbound_dry_run_log` para o handler, filtrando `created_at > snapshot`. Contar: claimed (= linhas novas), processed, match, divergent, legacy_missing, error.
6. **Confirmar zero side-effect:**
   - `process_status` dos `inbound_event_id` da rodada: 100% ainda `received`.
   - `integration_inbound_event_claims` para esses ids + handler: 0 (claim é liberado após processamento).
   - Sem novos inserts/updates em `messages` / `message_threads` (read-only por design — confirmado pelo código, sem necessidade de diff destrutivo).
7. **Gate de parada** — se a rodada apresentar `divergent > 0` OU `error > 0`, PARAR e reportar exemplos (`inbound_event_id`, `diff_summary`, `intended_actions`, `legacy_actual`). Não executar a rodada seguinte.

## Relatório final esperado (por rodada)
- counters: claimed / processed / match / divergent / legacy_missing / error
- confirmação `enabled=false` ao final
- confirmação de zero side-effect em produção
- worker_id e janela temporal da rodada

## Fora de escopo (explícito)
- Backfill dos ~26k eventos com `organization_id` NULL
- Criação de cron
- Alteração de `rpc_claim_inbound_shadow_events`, webhook legado, `messages`, `message_threads`, `process_status`
- Alterações de código no dispatcher (patch atual já atende)

## Observação técnica
O dispatcher já exclui candidates presentes em `dry_run_log` para o mesmo handler, então a Rodada 2 selecionará automaticamente 50 eventos distintos dos da Rodada 1 (e da rodada aprovada anterior).
