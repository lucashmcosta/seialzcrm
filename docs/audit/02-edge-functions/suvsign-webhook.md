# suvsign-webhook

- LOC: 370
- Gatilho: webhook público SuvSign (assinatura eletrônica). Verifica assinatura HMAC no header.
- Imports: `jsr:@supabase/supabase-js@2`, `../_shared/feature-flags.ts` (`featureFlagEnabled`).
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (e provavelmente `SUVSIGN_WEBHOOK_SECRET` — verificar).
- Tabelas lidas: `integration_inbound_events`, `organization_integrations`, `opportunities`, `attachments`.
- Tabelas escritas: `integration_inbound_events` (dedup), `integration_inbound_ingest_errors`, `attachments` (armazena PDF assinado), `activities` (registra evento).
- APIs externas: `fetch(fileUrl)` para baixar PDF assinado da SuvSign.
- Observações: integração de contrato ligada a `opportunities`. Feature flag controla ativação. [INCERTO] validação de origem/host do `fileUrl`.
