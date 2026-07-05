# Auditoria Técnica — Progresso

Regras: apenas leitura do código-fonte, saída exclusiva em `docs/audit/`. Nada de valores de secrets, apenas nomes de env vars. Marcar `[INCERTO]` quando aplicável.

Legenda: ⬜ pendente · 🟡 em andamento · ✅ concluído

## Seções

| # | Arquivo | Status | Atualizado |
|---|---------|--------|------------|
| 1 | `01-overview.md` | ✅ | 2026-07-05 |
| 2 | `02-edge-functions/` (90 fichas) | 🟡 | 2026-07-05 |
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

### Bloco D — AI Agent, knowledge, wizard, BYOK (parcial)
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
- [ ] synthesize-knowledge
- [ ] apply-knowledge-edit
- [ ] knowledge-edit
- [ ] knowledge-wizard
- [ ] wizard-generate-content
- [ ] wizard-next-question
- [ ] byok-set-key
- [ ] byok-rotate-key
- [ ] byok-revoke-key
- [ ] byok-test-key
- [ ] byok-update-policy
- [ ] migrate-legacy-ai-key

### Bloco E — Intelligence, admin, kommo, misc
- [ ] intelligence-worker
- [ ] intelligence-backfill-runner
- [ ] intelligence-ghosting-detector
- [ ] intelligence-retention-cron
- [ ] intelligence-rollup-cron
- [ ] admin-impersonate
- [ ] admin-impersonate-end
- [ ] admin-impersonate-switch
- [ ] admin-list-orgs-for-switch
- [ ] create-user
- [ ] kommo-fetch-pipelines
- [ ] kommo-fix-owners
- [ ] kommo-media-download
- [ ] kommo-migrate
- [ ] kommo-preview
- [ ] kommo-rollback
- [ ] kommo-validate
- [ ] nammux-audit
- [ ] nammux-download-attachment
- [ ] nammux-replay-opportunity
- [ ] nammux-test-connection
- [ ] suvsign-webhook
- [ ] export-conversations
- [ ] fix-orphan-opportunities
- [ ] outbox-health
- [ ] health
