# Sentry (observabilidade)

## Uso

- Frontend: `src/instrument.ts` inicializa SDK Sentry no boot.
- Edge functions: apenas `health` referencia `SENTRY_DSN`/`SENTRY_RELEASE`/`ENVIRONMENT`. Não há instrumentação sistemática nas outras 89 functions — cada falha é apenas logada em stdout (visível nos Edge Function logs do Supabase).

## Env vars

`SENTRY_DSN`, `SENTRY_RELEASE`, `ENVIRONMENT`.

## Observações

- Instrumentar `ai-agent-respond`, `meta-whatsapp-webhook`, `twilio-whatsapp-webhook`, `suvsign-webhook`, `integration-worker`, `intelligence-worker` traria ganho enorme de observabilidade. Ver dívida em `07-divida-tecnica.md`.
