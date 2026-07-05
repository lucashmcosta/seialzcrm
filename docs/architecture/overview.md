# Arquitetura — visão geral

Fonte: `docs/audit/01-overview.md`, `03-frontend-*`, `05-multi-tenancy.md`.

## Stack

- **Frontend**: React 18 + Vite 5 + TypeScript, Tailwind + shadcn/Radix, react-router v6, `@tanstack/react-query` (subutilizada), Sentry.
- **Backend as a service**: Supabase (Postgres + Auth + Storage + Edge Functions Deno).
- **Realtime/pipeline externo**: Railway (mensageria WhatsApp — memory `architecture/whatsapp-railway-migration-v2`).
- **Voz**: Twilio WebRTC (`@twilio/voice-sdk`) direto no cliente.
- **Deploy**: Vercel (frontend) + Supabase (functions/DB).

## Camadas

```
[Cliente React SPA]
  ├── Contextos globais: Auth, Organization, OutboundCall, Theme
  ├── react-query em Marketing; useState/useEffect no resto
  ├── @supabase/supabase-js (RLS aplicada com JWT do usuário)
  └── Twilio Voice SDK

[Supabase]
  ├── Postgres (261 migrations, RLS por organization_id)
  ├── Edge Functions (90 funções Deno)
  │   ├── Webhooks: meta-whatsapp-webhook, twilio-whatsapp-webhook, twilio-webhook, suvsign-webhook, lead-webhook
  │   ├── Workers: integration-worker, intelligence-worker, integration-inbound-dispatcher
  │   ├── Crons: 14 pg_cron jobs (ver audit/06)
  │   └── Ferramentas: ai-agent-respond, ai-generate, knowledge-*, kommo-*, meta-*, byok-*
  ├── Storage (buckets por org)
  └── pg_cron + pg_net

[Externos]
  ├── Meta Graph (WhatsApp Cloud, Lead Ads, CAPI, Ads Manager)
  ├── Twilio (WhatsApp, Voice, Media)
  ├── Anthropic Claude, OpenAI, Gemini (via BYOK ou Lovable AI Gateway)
  ├── Voyage AI (embeddings + reranker)
  ├── Kommo (import/mirror), Nammux (ERP), SuvSign (assinatura)
  └── Railway (mensageria)
```

## Isolamento multi-tenant

- Todas as tabelas de negócio: `organization_id = ANY(current_user_org_ids())`.
- Ver `docs/audit/05-multi-tenancy.md` e `docs/product/permissions-overview.md`.

## Fila / eventos inbound

Webhooks só enfileiram em `integration_inbound_events`; `integration-inbound-dispatcher` consome em modo claim/lease. Coexiste com caminho legado que escreve direto em `messages`.

## Fila outbound (integrações)

`integration_jobs` → `integration-worker` (autenticação via `INTEGRATION_WORKER_TOKEN`). Handlers registrados em `_shared/integration-handlers/registry.ts`.

## Design system

Seialz v1 — ver `docs/DESIGN_SYSTEM.md` e memories `design-system/seialz-*`.

## Pontos de dívida arquitetural

Ver `docs/audit/07-divida-tecnica.md` para lista priorizada.
