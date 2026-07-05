# Status da Documentação

Snapshot: **2026-07-05** (pós-refinamento — ver [`audit/09-documentation-refinement.md`](audit/09-documentation-refinement.md)).
Fonte de verdade: código-fonte + banco vivo + `docs/audit/` (congelada em 2026-07-04).

---

## 1. O que já está documentado

### Entrada (`docs/`)
- `README.md` — mapa de navegação (roteamento por pergunta).
- `getting-started.md` — setup local, env vars, deploy, troubleshooting.
- `CONTRIBUTING.md` — convenções, gerado×manual, como documentar módulo novo, anti-drift.

### Produto (`docs/product/`)
- `modules.md` — mapa de módulos ↔ rotas em `src/App.tsx`.
- `navigation-map.md` — fluxo de navegação e guards.
- `permissions-overview.md` — RLS, `current_user_org_ids()`, papéis.
- `terminology.md` — glossário bilingue PT↔EN.
- `channel-boundaries.md` — **Inbox × Messages: separação por decisão de negócio** (áreas, roteamento, riscos de unificação).
- `design/design-system.md` + `design/icon-system.md` — design system Seialz v1 e Phosphor Icons.

### Arquitetura (`docs/architecture/`)
- `overview.md` — stack (React + Supabase + Railway + Twilio).
- `event-flow.md` — 10 fluxos (WhatsApp in/out, Lead Ads, CAPI, RAG, etc.).

### Módulos (`docs/modules/`)
14 módulos × (`README.md` + `data-model.md`): admin, ai-agent, billing, companies, contacts, inbox, intelligence, knowledge-base, marketing, messages, opportunities, settings, tasks, whatsapp-templates. **Inbox e Messages são módulos distintos por decisão de negócio** — não fundir (ver `product/channel-boundaries.md`).

### Integrações (`docs/integrations/`)
12 fichas: byok, kommo, lovable-ai-gateway, meta-capi, meta-lead-ads, nammux, sentry, suvsign, voice-twilio, voyage, whatsapp-meta-cloud, whatsapp-twilio.

### Plataforma (`docs/platform/`)
database, security, observability, performance, infrastructure, deployment.

### Operations (`docs/operations/`)
- `README.md` — Regra do Drift + runbooks + cron (15 jobs).
- `drift/2026-07-04.md` — pendências P0–P2 ativas.
- `conflicts.md` — divergências descoberta ↔ repo.
- `audits/` — auditorias pontuais read-only (saúde do número 7020, janela CTWA 72h).

### Decisions (`docs/decisions/`)
9 ADRs (multi-tenancy, admin+MFA, BYOK, inbound queue, design system, idempotência, drift rule, catálogo de ownership, separação Inbox×Messages).

### Referência (`docs/reference/`)
- `catalog.md` — ownership por domínio + **mapa domínio técnico ↔ módulo de produto**.
- `database/database-full.md` — 117 tabelas, 107 triggers, 232 policies, 15 crons, 88 edge fns.
- `database/trigger-functions.sql` — 48 funções.

### Mobile (`docs/mobile/`)
Contexto arquitetural, referência de backend e spec do dashboard para o app React Native/Expo.

### Planos (`docs/plans/` e `docs/inbox-v2/`)
Specs de trabalho em andamento com ciclo de vida definido (`plans/README.md`): snippets internos, Inbox v2 Fase 0/1.

### Auditoria congelada (`docs/audit/`)
90 fichas de edge functions, 13 de integrações, análises de dívida técnica e cron. **Não modificar.** Inclui `09-documentation-refinement.md` (registro do refinamento de 2026-07-05).

---

## 2. O que é gerado automaticamente

| Arquivo | Origem | Como regenerar |
|---|---|---|
| `reference/database/database-full.md` | Banco vivo | Queries no rodapé do arquivo |
| `reference/database/trigger-functions.sql` | `pg_proc` | Query no rodapé |

Tudo mais é mantido manualmente com base em evidência (código, banco, auditoria).

---

## 3. Pendências de documentação

- `reference/api/` — vazio, aguardando geração a partir dos edge functions.
- `reference/events/` — vazio, aguardando catálogo de eventos (`integration_inbound_events`, webhook payloads).
- `reference/generated/` — vazio, reservado para OpenAPI e diagramas gerados.
- Runbooks específicos por incidente (hoje só `operations/README.md` genérico).
- Diagramas visuais dos fluxos de `architecture/event-flow.md` (hoje só texto).
- Fluxo local de migrations/Supabase CLI não padronizado — `[TODO]` em `getting-started.md`.
- `[INCERTO]` regra exata de grandfathering de preço/trial — [`modules/billing/README.md`](modules/billing/README.md); validar no código antes de alterar billing.
- `[INCERTO]` detalhe do loop de recálculo entre triggers de `messages`/`message_threads` corrigido no passado — [`platform/performance/README.md`](platform/performance/README.md); revalidar antes de mexer nas triggers de denormalização.
- Buckets de Storage listados como "prováveis" (`attachments`, `logos`, `call-recordings`, `voice-audio`) sem verificação formal — [`platform/infrastructure/README.md`](platform/infrastructure/README.md).

---

## 4. Drift ativo (repo ≠ prod)

**Fonte única:** [`operations/drift/2026-07-04.md`](operations/drift/2026-07-04.md) — 8 pendências (2× P0: audit triggers duplicadas / 3 edge functions shadow; 3× P1; 3× P2). Este arquivo não replica a lista para não divergir dela.

---

## 5. Próxima onda recomendada

Nesta ordem:

1. **Resolver P0 #1** — consolidar triggers de audit duplicados e vacuum de `audit_logs`. Documentar no mesmo commit sob `operations/drift/`.
2. **Resolver P0 #2** — trazer as 3 edge functions shadow para o repo (ou removê-las do dashboard). Sem isso, `audit/` e `reference/` mentem sobre a superfície real.
3. **Gerar `reference/events/`** — catalogar payloads de webhook (Twilio, Meta, Kommo, SuvSign) e eventos internos. Maior lacuna entre `architecture/event-flow.md` e o código real.
4. **Gerar `reference/api/`** — extrair contratos das 88 edge functions (input/output + mecanismo de auth), resolvendo parcialmente o drift #5.
5. **Sincronizar migrations (drift #4)** — reconciliar 261 ↔ 184 antes de qualquer refactor grande.
6. **Runbooks reais** — só depois de 1–5, escrever runbook por incidente concreto observado (não hipotético).
