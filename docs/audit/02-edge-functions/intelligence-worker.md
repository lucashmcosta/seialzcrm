# intelligence-worker

- LOC: 111
- Gatilho: cron (worker loop) autenticado via header `x-worker-token` = `INTELLIGENCE_WORKER_TOKEN`.
- Imports: `jsr:@supabase/supabase-js@2`. Sem `_shared/`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTELLIGENCE_WORKER_TOKEN`.
- Tabelas escritas: `intelligence_jobs` (update de status/erro).
- RPC: `rpc_claim_intelligence_jobs` (claim atômico do job).
- APIs externas: nenhuma. Faz `fetch` interno para outras edge functions em `${SUPABASE_URL}/functions/v1/<handlerPath>` conforme `handler` do job (ex.: `analyze-message`).
- Observações: despacha jobs para handlers; falhas gravam back-off. [INCERTO] mapa de handlers definido inline por convenção.
