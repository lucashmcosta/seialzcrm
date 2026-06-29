## Caminho A — Recovery Viagi em 2 lotes (read+dispatch only, sem alterar código)

### Pré-requisito: confirm_token correto

⚠️ O token que o usuário enviou foi `VIAGI_RECOVERY_2026_06_29`, mas o código (`supabase/functions/meta-lead-ads-recovery-viagi/index.ts:24`) exige literalmente `VIAGI_RECOVERY_2026_06_19`. Vou usar o token correto do código — caso contrário a função retorna 400.

### Passos

1. **Tabela diária BRT exata dos 162 `would_import`** — parsear `would_import_full` do count salvo, agrupar por `created_time` convertido para America/Sao_Paulo (UTC-3), entregar tabela `dia_BRT | leads_pendentes`.

2. **Lote 1** — `POST /meta-lead-ads-recovery-viagi`
   ```json
   {
     "mode": "apply",
     "since_override_iso": "2026-06-19T17:18:03Z",
     "limit": 100,
     "confirm_token": "VIAGI_RECOVERY_2026_06_19"
   }
   ```
   Reporta: `graph_total_fetched`, `already_imported`, `applied.ok`, `applied.failed`, `applied.remaining_after_this_batch`, `applied.errors`.

3. **Lote 2** (se `remaining_after_this_batch > 0`) — mesmo payload. Idempotência garante zero duplicatas (dedup por `source_external_id` no início).

4. **Count final** — mesmo `since_override_iso`, `mode=count`. Confirmar `would_import == 0`.

### Stop point

Se qualquer lote retornar `failed > 0`, paro, reporto erros e aguardo decisão antes de continuar.

### Fora de escopo

Nenhuma alteração de código, nenhum aumento de cap, nenhuma feature nova na função.
