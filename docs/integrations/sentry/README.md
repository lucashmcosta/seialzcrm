# Sentry

**Referência técnica:** `docs/audit/04-integracoes/sentry.md`.

## Frontend
`src/instrument.ts` inicializa `@sentry/react` + `@sentry/vite-plugin` para source maps.

## Edge functions
🔴 **Não instrumentado nas 89+ edge functions.** Só `health` referencia `SENTRY_DSN`. Dívida crítica — ver `07-divida-tecnica.md`.

Prioridade para instrumentar:
- `ai-agent-respond`
- `meta-whatsapp-webhook`
- `twilio-whatsapp-webhook`
- `suvsign-webhook`
- `integration-worker`
- `intelligence-worker`
- `meta-lead-ads-*`
