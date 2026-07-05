# Status da Documentação

Snapshot: **2026-07-05** (pós-refinamento — ver [`audit/09-documentation-refinement.md`](audit/09-documentation-refinement.md) — e pós-rodada P0/P1/P2 do mesmo dia).
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
- `security/verify-jwt-review.md` — matriz das 93 edge functions × mecanismo de auth (drift #5 resolvido como análise; correções de código pendentes).

### Operations (`docs/operations/`)
- `README.md` — Regra do Drift + runbooks + cron (15 jobs).
- `drift/2026-07-04.md` — pendências P0–P2 ativas (com progresso de 2026-07-05 anotado por item).
- `conflicts.md` — divergências descoberta ↔ repo.
- `audits/` — auditorias pontuais read-only (saúde do número 7020, janela CTWA 72h).
- `proposals/` — SQL corretivo pronto para revisão, **não aplicado** (dedup de audit triggers; cron órfã).
- `shadow-functions/` — código recuperado das 3 functions deployadas fora do repo.

### Decisions (`docs/decisions/`)
9 ADRs (multi-tenancy, admin+MFA, BYOK, inbound queue, design system, idempotência, drift rule, catálogo de ownership, separação Inbox×Messages).

### Referência (`docs/reference/`)
- `catalog.md` — ownership por domínio + **mapa domínio técnico ↔ módulo de produto**.
- `database/database-full.md` — 117 tabelas, 107 triggers, 232 policies, 15 crons, 88 edge fns (contagem real em 2026-07-05: **93** deployadas — regenerar no próximo ciclo).
- `database/trigger-functions.sql` — 48 funções.
- `api/` — superfície HTTP (93 functions por chamador/auth) — parcial, contratos `[TODO]`.
- `events/` — outbox (7 event_types com volumes), fila inbound, webhooks, CAPI, realtime — parcial, schemas `[TODO]`.

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

- `reference/api/` — índice criado (2026-07-05); faltam contratos input/output por função `[TODO]`.
- `reference/events/` — catálogo criado (2026-07-05); faltam schemas de payload `[TODO]`.
- `reference/generated/` — vazio, reservado para OpenAPI e diagramas gerados.
- Runbooks específicos por incidente (hoje só `operations/README.md` genérico).
- Diagramas visuais dos fluxos de `architecture/event-flow.md` (hoje só texto).
- Fluxo local de migrations/Supabase CLI não padronizado — `[TODO]` em `getting-started.md`.
- `[INCERTO]` regra exata de grandfathering de preço/trial — [`modules/billing/README.md`](modules/billing/README.md); validar no código antes de alterar billing.
- `[INCERTO]` detalhe do loop de recálculo entre triggers de `messages`/`message_threads` corrigido no passado — [`platform/performance/README.md`](platform/performance/README.md); revalidar antes de mexer nas triggers de denormalização.
- Buckets de Storage listados como "prováveis" (`attachments`, `logos`, `call-recordings`, `voice-audio`) sem verificação formal — [`platform/infrastructure/README.md`](platform/infrastructure/README.md).

---

## 4. Drift ativo (repo ≠ prod)

**Fonte única:** [`operations/drift/2026-07-04.md`](operations/drift/2026-07-04.md) (+ [`2026-07-05.md`](operations/drift/2026-07-05.md)) — este arquivo não replica a lista para não divergir dela. Estado em 2026-07-05: **P0 #1** proposta de SQL pronta (revisão pendente); **P0 #2** código recuperado e versionado (redeploy/remoção pendentes); **P1 #3** investigada, decisão de produto pendente; **P1 #5** matriz concluída (correções de código pendentes); **P1 #4, P2 #6–#8, #9** sem alteração.

---

## 5. Próxima onda recomendada

Tudo abaixo exige banco, deploy ou decisão — nada é só repo:

1. **Aplicar P0 #1** — revisar e executar [`operations/proposals/2026-07-05-audit-trigger-dedup.sql`](operations/proposals/2026-07-05-audit-trigger-dedup.sql) em janela; fase 2 (expurgo + vacuum de 463 MB) separada.
2. **Fechar P0 #2** — push/redeploy da `marketing-campaign-enrich` via pipeline (⚠️ push = deploy) e remoção das 2 functions de debug do dashboard.
3. **Decidir P1 #3** — opção A (reativar cron) ou B (aposentar feature) em [`operations/proposals/2026-07-05-scheduled-messages-cron.sql`](operations/proposals/2026-07-05-scheduled-messages-cron.sql); Passo 0 obrigatório antes de qualquer reativação.
4. **Corrigir grupo 🔴 do verify_jwt** — propor patches para `twilio-whatsapp-send`, `meta-whatsapp-send`, `ai-agent-respond`, `twilio-webhook` ([`platform/security/verify-jwt-review.md`](platform/security/verify-jwt-review.md)).
5. **Sincronizar migrations (drift #4)** — `supabase db diff` + `migration repair` (inclui as duas de abril, item #9); pré-requisito para refactors grandes.
6. **P2 #6–#8 e runbooks reais** — depois de 1–5.
