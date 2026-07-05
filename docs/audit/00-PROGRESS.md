# Auditoria Técnica — Progresso

Regras: apenas leitura do código-fonte, saída exclusiva em `docs/audit/`. Nada de valores de secrets, apenas nomes de env vars. Marcar `[INCERTO]` quando aplicável.

Legenda: ⬜ pendente · 🟡 em andamento · ✅ concluído

## Seções

| # | Arquivo | Status | Atualizado |
|---|---------|--------|------------|
| 1 | `01-overview.md` | ✅ | 2026-07-05 |
| 2 | `02-edge-functions/` (90 fichas) | ✅ | 2026-07-05 |
| 3a | `03-frontend-rotas.md` | ⬜ | — |
| 3b | `03-frontend-hooks.md` | ⬜ | — |
| 3c | `03-frontend-estado.md` | ⬜ | — |
| 4 | `04-integracoes/` | ⬜ | — |
| 5 | `05-multi-tenancy.md` | ⬜ | — |
| 6 | `06-cron-automacoes.md` | ⬜ | — |
| 7 | `07-divida-tecnica.md` | ⬜ | — |

## Edge functions (90) — ordem por criticidade

### Bloco A — Mensageria e webhooks críticos (prioridade máxima)
- [x] meta-whatsapp-webhook
- [x] meta-whatsapp-send
- [x] meta-whatsapp-connect
- [x] meta-whatsapp-disconnect
- [x] meta-whatsapp-verify
- [x] meta-whatsapp-templates-create
- [x] meta-whatsapp-templates-sync
- [x] meta-wa-diagnose
- [x] twilio-whatsapp-webhook
- [x] twilio-whatsapp-send
- [x] twilio-whatsapp-setup
- [x] twilio-whatsapp-templates
- [x] lead-webhook
- [x] integration-inbound-dispatcher
- [x] integration-worker
- [x] scheduled-messages-cron

### Bloco B — Twilio Voice + áudio + mídia ✅ 2026-07-05
- [x] twilio-call
- [x] twilio-webhook
- [x] twilio-token
- [x] twilio-setup
- [x] twilio-media-proxy
- [x] transcribe-audio

### Bloco C — Meta Ads, CAPI, Lead Ads ✅ 2026-07-05
- [x] meta-ads-manager-save
- [x] meta-capi-connect
- [x] meta-capi-connect-from-existing
- [x] meta-capi-retry-cron
- [x] meta-capi-send-event
- [x] meta-discover-ad-accounts
- [x] meta-discover-ads-cron
- [x] meta-lead-ads-connect
- [x] meta-lead-ads-discover
- [x] meta-lead-ads-poll
- [x] meta-lead-ads-process-lead
- [x] meta-lead-ads-token-health
- [x] meta-lead-ads-backfill-viagi
- [x] meta-lead-ads-recovery-viagi
- [x] meta-lead-ads-viagi-token-probe
- [x] marketing-insights-sync-daily
- [x] viagi-staging-loader
- [x] ct-backfill-once
- [x] backfill-attribution

### Bloco D — AI Agent, knowledge, wizard, BYOK ✅ 2026-07-05
- [x] ai-agent-respond
- [x] ai-generate
- [x] analyze-message
- [x] classify-agent-feedback
- [x] generate-embedding
- [x] enhance-knowledge
- [x] import-knowledge
- [x] import-from-url
- [x] process-knowledge
- [x] process-knowledge-item
- [x] reprocess-knowledge
- [x] synthesize-knowledge
- [x] apply-knowledge-edit
- [x] knowledge-edit
- [x] knowledge-wizard
- [x] wizard-generate-content
- [x] wizard-next-question
- [x] byok-set-key
- [x] byok-rotate-key
- [x] byok-revoke-key
- [x] byok-test-key
- [x] byok-update-policy
- [x] migrate-legacy-ai-key

### Bloco E — Intelligence, admin, kommo, misc ✅ 2026-07-05
- [x] intelligence-worker
- [x] intelligence-backfill-runner
- [x] intelligence-ghosting-detector
- [x] intelligence-retention-cron
- [x] intelligence-rollup-cron
- [x] admin-impersonate
- [x] admin-impersonate-end
- [x] admin-impersonate-switch
- [x] admin-list-orgs-for-switch
- [x] create-user
- [x] kommo-fetch-pipelines
- [x] kommo-fix-owners
- [x] kommo-media-download
- [x] kommo-migrate
- [x] kommo-preview
- [x] kommo-rollback
- [x] kommo-validate
- [x] nammux-audit
- [x] nammux-download-attachment
- [x] nammux-replay-opportunity
- [x] nammux-test-connection
- [x] suvsign-webhook
- [x] export-conversations
- [x] fix-orphan-opportunities
- [x] outbox-health
- [x] health

**Seção 2 (Edge Functions — 90 fichas) concluída.**
