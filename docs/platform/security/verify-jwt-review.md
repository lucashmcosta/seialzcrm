# Revisão verify_jwt — matriz function × mecanismo de auth (2026-07-05)

Resolve a "ação pendente" do drift P1 #5 ([`operations/drift/2026-07-04.md`](../../operations/drift/2026-07-04.md)). Método: inventário deployado via API read-only (93 functions ACTIVE em 2026-07-05) + classificação por leitura/grep do código em `supabase/functions/`. **Nenhuma configuração foi alterada.**

**Fato base:** todas as functions estão com `verify_jwt = false` no gateway (única exceção: `twilio-message-debug`, shadow, com `true`). Isso é intencional para webhooks e crons, mas transfere 100% da responsabilidade de auth para o código de cada função — e nem todas cumprem.

## Grupos

### A — Auth interna sólida (token de serviço/worker) ✅ 18 functions
Validam `service_role` JWT (`validateServiceRoleAuth`), `INTEGRATION_WORKER_TOKEN`, `INTELLIGENCE_WORKER_TOKEN` ou token interno do Vault. Chamadas por pg_cron/pg_net ou edge→edge. `verify_jwt=false` correto.

`analyze-message`, `integration-worker`, `intelligence-backfill-runner`, `intelligence-ghosting-detector`, `intelligence-retention-cron`, `intelligence-rollup-cron`, `intelligence-worker`, `marketing-campaign-enrich`, `marketing-insights-sync-daily`, `meta-ads-manager-save`, `meta-discover-ad-accounts`, `meta-discover-ads-cron`, `meta-lead-ads-poll`, `meta-lead-ads-process-lead`, `meta-lead-ads-recovery-viagi`, `meta-lead-ads-token-health`, `scheduled-messages-cron`, `transcribe-audio`.

### B — JWT de usuário validado in-function ✅ 16 functions
Extraem o usuário do `Authorization` (via `getUser`/`requireOrgAdmin`/checagem `admin_users`). `verify_jwt=false` aceitável (a função valida), mas ligar `verify_jwt=true` seria defesa em profundidade gratuita.

`admin-impersonate`, `admin-impersonate-switch`, `ai-generate`, `apply-knowledge-edit`, `byok-revoke-key`, `byok-rotate-key`, `byok-set-key`, `byok-test-key`, `byok-update-policy`, `create-user`, `export-conversations`, `knowledge-edit`, `kommo-media-download`, `kommo-rollback`, `migrate-legacy-ai-key`, `nammux-replay-opportunity`, `twilio-call`, `twilio-media-proxy`, `twilio-token`. *(19 — inclui 3 com validação parcial a confirmar)*

### C — Webhooks públicos com verificação própria ✅ 7 functions
Precisam de `verify_jwt=false` por natureza (chamador externo não tem JWT Supabase).

| Função | Verificação |
|---|---|
| `meta-whatsapp-webhook` | `hub.verify_token` no handshake. `[INCERTO]` assinatura `X-Hub-Signature-256` nos POSTs — confirmar |
| `twilio-whatsapp-webhook` | Assinatura HMAC Twilio ✅ |
| `suvsign-webhook` | Secret de webhook ✅ |
| `lead-webhook` | `x-api-key` ✅ |
| `nammux-audit`, `nammux-test-connection`, `nammux-download-attachment` | Secret configurado ✅ |
| `outbox-health` | `x-health-token` ✅ |
| `health` | Público por design (healthcheck) ✅ |

### D — Lê `Authorization` mas validação não confirmada ⚠️ 11 functions
Leem o header (possível passthrough para RLS ou validação implícita). `[INCERTO]` — confirmar função a função se **rejeitam** chamada sem JWT válido:

`import-knowledge`, `kommo-fetch-pipelines`, `kommo-preview`, `kommo-validate`, `meta-capi-connect`, `meta-capi-connect-from-existing`, `meta-capi-send-event`, `meta-lead-ads-connect`, `meta-lead-ads-discover`, `meta-whatsapp-connect`, `meta-whatsapp-disconnect`, `meta-whatsapp-verify`.

### E — 🔴 SEM autenticação de chamador detectável — risco real
`verify_jwt=false` + nenhuma validação no código + service_role interno = **endpoint público com privilégio total**. Confirmado por leitura direta nos casos marcados ✔; demais por grep (nenhum header/secret lido).

| Função | Operação exposta | Severidade |
|---|---|---|
| `twilio-whatsapp-send` ✔ | **Envia WhatsApp em nome de qualquer org** (payload escolhe thread/endpoint) | 🔴 crítica |
| `meta-whatsapp-send` ✔ | Idem via Meta Cloud | 🔴 crítica |
| `ai-agent-respond` ✔ | Dispara pipeline LLM completo (custo + escrita em threads) | 🔴 crítica |
| `kommo-migrate` ✔ | Roda import/migração com service_role a partir de `import_log_id` | 🔴 alta |
| `twilio-whatsapp-setup`, `twilio-setup`, `twilio-whatsapp-templates`, `meta-whatsapp-templates-create`, `meta-whatsapp-templates-sync`, `meta-wa-diagnose` | Configuração/templates de canal sem auth | 🔴 alta |
| `admin-impersonate-end`, `admin-list-orgs-for-switch` ✔ | Operam por `sessionId` (UUID como capability token — adivinhável só por vazamento, mas sem verificação de identidade) | 🟡 média |
| `backfill-attribution`, `ct-backfill-once`, `fix-orphan-opportunities`, `kommo-fix-owners`, `meta-lead-ads-backfill-viagi`, `viagi-staging-loader` | One-shots de escrita em massa invocáveis por qualquer um | 🟡 média (dano alto, descoberta improvável) |
| `process-knowledge`, `process-knowledge-item`, `reprocess-knowledge`, `enhance-knowledge`, `synthesize-knowledge`, `generate-embedding`, `knowledge-wizard`, `wizard-next-question`, `wizard-generate-content`, `classify-agent-feedback` | Processamento/LLM — abuso de custo | 🟡 média |
| `twilio-webhook` | Webhook de voz **sem validação de assinatura Twilio detectada** — eventos de chamada forjáveis | 🔴 alta |
| `meta-capi-retry-cron`, `integration-inbound-dispatcher` | Disparo de processamento interno (idempotente, dano baixo) | 🟢 baixa |

### Shadow (fora do repo — ver [`operations/shadow-functions/`](../../operations/shadow-functions/README.md))
`meta-capi-raw-test` (🔴 auth fraca — só prefixo `Bearer`), `twilio-message-debug` (`verify_jwt=true`, debug concluído — remover).

## Recomendações (nenhuma aplicada)

1. **Curto prazo (código, sem mudar verify_jwt):** adicionar validação de chamador no grupo E — `validateServiceRoleAuth`/worker-token nos internos (sends, knowledge-*, one-shots) e `getUser` + checagem de org nos chamados pelo frontend. Prioridade absoluta: `twilio-whatsapp-send`, `meta-whatsapp-send`, `ai-agent-respond`, `twilio-webhook` (assinatura Twilio).
2. **Confirmar grupo D** função a função (rejeição efetiva sem JWT) e mover para B ou E.
3. **Confirmar assinatura dos POSTs** em `meta-whatsapp-webhook` (`X-Hub-Signature-256`).
4. **Médio prazo:** ligar `verify_jwt=true` em tudo que só é chamado pelo frontend (grupos B e parte de D/E) — os chamadores já enviam JWT; webhooks (C) e crons (A) permanecem `false`.
5. Aposentar os one-shots concluídos (`ct-backfill-once`, `*-viagi`, `backfill-attribution`) em vez de blindá-los.

> Qualquer patch de código dos itens acima será proposto separadamente para revisão — não incluído nesta rodada.
