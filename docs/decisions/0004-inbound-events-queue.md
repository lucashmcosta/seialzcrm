# ADR 0004 — Pipeline de ingest: fila `integration_inbound_events` + dispatcher

**Status:** Adotado; caminho legado ainda ativo em paralelo.
**Evidência:** `supabase/functions/integration-inbound-dispatcher/`, `supabase/functions/meta-whatsapp-webhook/`, `supabase/functions/twilio-whatsapp-webhook/`, tabelas `integration_inbound_events`/`_claims`/`_dry_run_log`/`_ingest_errors`.

## Contexto
Webhooks Meta/Twilio precisavam ser processados rapidamente para não estourar timeout e para tolerar picos.

## Decisão
- Webhooks só validam e enfileiram em `integration_inbound_events` (deduplicado).
- `integration-inbound-dispatcher` consome via claim/lease.
- Modo dry-run em `integration_inbound_dry_run_log`.
- Caminho legado (escrever direto em `messages`) mantido até cutover completo do Inbox v2.

## Consequências
- Retry natural, sem perda em picos.
- Duas trilhas de código convivem — remover legado após Inbox v2 estável (memory `features/inbox-v2/status-2026-06-11`).
- Handlers de ingest concentrados em `_shared/integration-handlers/registry.ts`.
