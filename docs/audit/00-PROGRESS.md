# Auditoria Técnica — Progresso

Regras: apenas leitura do código-fonte, saída exclusiva em `docs/audit/`. Nada de valores de secrets, apenas nomes de env vars. Marcar `[INCERTO]` quando aplicável.

Legenda: ⬜ pendente · 🟡 em andamento · ✅ concluído

## Seções

| # | Arquivo | Status | Atualizado |
|---|---------|--------|------------|
| 1 | `01-overview.md` | ✅ | 2026-07-05 |
| 2 | `02-edge-functions/` (90 fichas) | ✅ | 2026-07-05 |
| 3a | `03-frontend-rotas.md` | ✅ | 2026-07-05 |
| 3b | `03-frontend-hooks.md` | ✅ | 2026-07-05 |
| 3c | `03-frontend-estado.md` | ✅ | 2026-07-05 |
| 4 | `04-integracoes/` (13 fichas) | ✅ | 2026-07-05 |
| 5 | `05-multi-tenancy.md` | ✅ | 2026-07-05 |
| 6 | `06-cron-automacoes.md` | ✅ | 2026-07-05 |
| 7 | `07-divida-tecnica.md` | ✅ | 2026-07-05 |

**Auditoria completa.** Todas as seções entregues em `docs/audit/`.

## Edge functions (90) — ordem por criticidade

### Bloco A — Mensageria e webhooks críticos ✅ 2026-07-05
- [x] meta-whatsapp-webhook, meta-whatsapp-send, meta-whatsapp-connect, meta-whatsapp-disconnect, meta-whatsapp-verify, meta-whatsapp-templates-create, meta-whatsapp-templates-sync, meta-wa-diagnose
- [x] twilio-whatsapp-webhook, twilio-whatsapp-send, twilio-whatsapp-setup, twilio-whatsapp-templates
- [x] lead-webhook, integration-inbound-dispatcher, integration-worker, scheduled-messages-cron

### Bloco B — Twilio Voice + áudio + mídia ✅ 2026-07-05
- [x] twilio-call, twilio-webhook, twilio-token, twilio-setup, twilio-media-proxy, transcribe-audio

### Bloco C — Meta Ads, CAPI, Lead Ads ✅ 2026-07-05
- [x] meta-ads-manager-save, meta-capi-connect, meta-capi-connect-from-existing, meta-capi-retry-cron, meta-capi-send-event, meta-discover-ad-accounts, meta-discover-ads-cron
- [x] meta-lead-ads-connect, meta-lead-ads-discover, meta-lead-ads-poll, meta-lead-ads-process-lead, meta-lead-ads-token-health, meta-lead-ads-backfill-viagi, meta-lead-ads-recovery-viagi, meta-lead-ads-viagi-token-probe
- [x] marketing-insights-sync-daily, viagi-staging-loader, ct-backfill-once, backfill-attribution

### Bloco D — AI Agent, knowledge, wizard, BYOK ✅ 2026-07-05
- [x] ai-agent-respond, ai-generate, analyze-message, classify-agent-feedback, generate-embedding, enhance-knowledge
- [x] import-knowledge, import-from-url, process-knowledge, process-knowledge-item, reprocess-knowledge, synthesize-knowledge
- [x] apply-knowledge-edit, knowledge-edit, knowledge-wizard, wizard-generate-content, wizard-next-question
- [x] byok-set-key, byok-rotate-key, byok-revoke-key, byok-test-key, byok-update-policy, migrate-legacy-ai-key

### Bloco E — Intelligence, admin, kommo, misc ✅ 2026-07-05
- [x] intelligence-worker, intelligence-backfill-runner, intelligence-ghosting-detector, intelligence-retention-cron, intelligence-rollup-cron
- [x] admin-impersonate, admin-impersonate-end, admin-impersonate-switch, admin-list-orgs-for-switch, create-user
- [x] kommo-fetch-pipelines, kommo-fix-owners, kommo-media-download, kommo-migrate, kommo-preview, kommo-rollback, kommo-validate
- [x] nammux-audit, nammux-download-attachment, nammux-replay-opportunity, nammux-test-connection
- [x] suvsign-webhook, export-conversations, fix-orphan-opportunities, outbox-health, health
