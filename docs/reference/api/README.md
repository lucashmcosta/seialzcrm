# Reference — API (superfície HTTP)

Índice da superfície HTTP do Seialz. Snapshot: **2026-07-05** (inventário deployado via API + código do repo). Contratos input/output por função ainda não extraídos — `[TODO]` (item 4 da próxima onda em `STATUS.md`).

## Camadas

1. **PostgREST** (`https://<ref>.supabase.co/rest/v1/`) — CRUD nas 117 tabelas com RLS (`organization_id = ANY(current_user_org_ids())`) + RPCs `rpc_*` via `supabase-js`. Inventário completo de RPCs: [`../database/database-full.md`](../database/database-full.md).
2. **Edge Functions** (`/functions/v1/<slug>`) — 93 deployadas (90 no repo + 3 shadow, ver [`../../operations/shadow-functions/`](../../operations/shadow-functions/README.md)).
3. **Realtime** (`wss`) — canais com RLS; tabelas publicadas listadas em [`../events/`](../events/README.md).

## Edge functions por tipo de chamador

Classificação de auth por função: [`../../platform/security/verify-jwt-review.md`](../../platform/security/verify-jwt-review.md). Fichas históricas detalhadas: `../../audit/02-edge-functions/`.

### Webhooks (chamador externo)
| Função | Origem | Verificação |
|---|---|---|
| `meta-whatsapp-webhook` | Meta Cloud API | `hub.verify_token`; assinatura de POST `[INCERTO]` |
| `twilio-whatsapp-webhook` | Twilio WhatsApp | HMAC Twilio |
| `twilio-webhook` | Twilio Voice | 🔴 sem assinatura detectada |
| `suvsign-webhook` | SuvSign | secret |
| `lead-webhook` | Genérico (landing pages etc.) | `x-api-key` |

### Workers / crons (chamador: pg_cron→pg_net ou edge→edge)
`integration-worker`, `integration-inbound-dispatcher`, `intelligence-worker`, `intelligence-backfill-runner`, `intelligence-ghosting-detector`, `intelligence-rollup-cron`, `intelligence-retention-cron`, `analyze-message`, `transcribe-audio`, `scheduled-messages-cron` (⚠️ órfã — drift #3), `meta-capi-retry-cron`, `meta-lead-ads-poll`, `meta-lead-ads-process-lead`, `meta-lead-ads-token-health`, `marketing-campaign-enrich`, `marketing-insights-sync-daily`, `meta-discover-ads-cron`, `outbox-health`, `health`.
Agenda dos 15 jobs: [`../../operations/README.md`](../../operations/README.md).

### Chamadas pelo frontend (JWT do usuário)
- **Admin**: `admin-impersonate`, `admin-impersonate-switch`, `admin-impersonate-end`, `admin-list-orgs-for-switch`, `create-user`.
- **BYOK/IA**: `byok-set-key`, `byok-test-key`, `byok-rotate-key`, `byok-revoke-key`, `byok-update-policy`, `migrate-legacy-ai-key`, `ai-generate`, `ai-agent-respond` (também interna).
- **Knowledge**: `import-knowledge`, `import-from-url`, `process-knowledge`, `process-knowledge-item`, `reprocess-knowledge`, `enhance-knowledge`, `synthesize-knowledge`, `knowledge-edit`, `apply-knowledge-edit`, `knowledge-wizard`, `wizard-next-question`, `wizard-generate-content`, `generate-embedding`, `classify-agent-feedback`.
- **Canais**: `meta-whatsapp-send`, `twilio-whatsapp-send` (⚠️ hoje sem validação de chamador — ver review), `meta-whatsapp-connect/-disconnect/-verify`, `meta-whatsapp-templates-create/-sync`, `meta-wa-diagnose`, `twilio-whatsapp-setup`, `twilio-whatsapp-templates`, `twilio-setup`, `twilio-token`, `twilio-call`, `twilio-media-proxy`.
- **Integrações**: `kommo-validate`, `kommo-fetch-pipelines`, `kommo-preview`, `kommo-migrate`, `kommo-rollback`, `kommo-fix-owners`, `kommo-media-download`, `nammux-test-connection`, `nammux-audit`, `nammux-download-attachment`, `nammux-replay-opportunity`, `meta-capi-connect`, `meta-capi-connect-from-existing`, `meta-capi-send-event`, `meta-lead-ads-connect`, `meta-lead-ads-discover`, `meta-discover-ad-accounts`, `meta-ads-manager-save`, `export-conversations`.

### One-shots / recuperações pontuais (candidatas a aposentadoria)
`ct-backfill-once`, `backfill-attribution`, `fix-orphan-opportunities`, `viagi-staging-loader`, `meta-lead-ads-backfill-viagi`, `meta-lead-ads-recovery-viagi`, `meta-lead-ads-viagi-token-probe`.

## `[TODO]`
- Extrair contrato (método, body, resposta, erros) por função — idealmente gerado a partir do código.
- OpenAPI em `../generated/` quando houver gerador.
