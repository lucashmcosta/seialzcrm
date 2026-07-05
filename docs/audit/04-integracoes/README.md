# Integrações — Visão Geral

Modelo: **integrações globais** (admin) em `admin_integrations` + **conexões por organização** em `organization_integrations`. Credenciais são criptografadas em coluna JSONB via helpers `_shared/crypto.ts` (`encryptSecret`/`decryptSecret`). Visibilidade condicional (memory `integrations/conditional-feature-visibility`).

Tabelas centrais:

| Tabela | Uso |
|---|---|
| `admin_integrations` | Catálogo global (Meta App IDs, Twilio account global etc.) |
| `organization_integrations` | Credenciais por org, `active`, `config` JSONB |
| `communication_endpoints` | Números/canais concretos (WhatsApp, voice) usados como remetentes |
| `integration_inbound_events` | Fila deduplicada de eventos recebidos |
| `integration_inbound_ingest_errors` | Erros de ingestão |
| `integration_jobs` | Fila para `integration-worker` |
| `integration_events` | Eventos processáveis (replay) |
| `integration_audit_logs` | Auditoria por integração |
| `integration_feature_flags` | Flags por integração |
| `integration_subscriptions` | Subscrições de eventos por org |
| `integration_inbound_handlers` | Registro de handlers |

Fichas por integração nesta pasta:

- `whatsapp-meta-cloud.md`
- `whatsapp-twilio.md`
- `voice-twilio.md`
- `meta-capi.md`
- `meta-lead-ads.md`
- `marketing-ads.md`
- `kommo.md`
- `nammux.md`
- `suvsign.md`
- `ai-providers-byok.md`
- `voyage-embeddings.md`
- `lovable-ai-gateway.md`
- `sentry.md`
