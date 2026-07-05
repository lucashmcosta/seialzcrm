# Status da Documentação

Snapshot: **2026-07-05**
Fonte de verdade: código-fonte + banco vivo + `docs/audit/` (congelada em 2026-07-04).

---

## 1. O que já está documentado

### Produto (`docs/product/`)
- `modules.md` — mapa de módulos ↔ rotas em `src/App.tsx`.
- `navigation-map.md` — fluxo de navegação e guards.
- `permissions-overview.md` — RLS, `current_user_org_ids()`, papéis.
- `terminology.md` — glossário bilingue PT↔EN (Atendimento ↔ `message_threads`, etc.).

### Arquitetura (`docs/architecture/`)
- `overview.md` — stack (React + Supabase + Railway + Twilio).
- `event-flow.md` — 10 fluxos (WhatsApp in/out, Lead Ads, CAPI, RAG, etc.).

### Módulos (`docs/modules/`)
14 módulos × (`README.md` + `data-model.md`): admin, ai-agent, billing, companies, contacts, inbox, intelligence, knowledge-base, marketing, messages, opportunities, settings, tasks, whatsapp-templates.

### Integrações (`docs/integrations/`)
12 fichas: byok, kommo, lovable-ai-gateway, meta-capi, meta-lead-ads, nammux, sentry, suvsign, voice-twilio, voyage, whatsapp-meta-cloud, whatsapp-twilio.

### Plataforma (`docs/platform/`)
database, security, observability, performance, infrastructure, deployment.

### Operations (`docs/operations/`)
- `README.md` — Regra do Drift + runbooks.
- `drift/2026-07-04.md` — 8 pendências P0–P2.
- `conflicts.md` — divergências descoberta ↔ repo.

### Decisions (`docs/decisions/`)
8 ADRs (multi-tenancy, admin+MFA, BYOK, inbound queue, design system, idempotência, drift rule, catálogo de ownership).

### Referência (`docs/reference/`)
- `catalog.md` — ownership por domínio.
- `database/database-full.md` — 117 tabelas, 107 triggers, 232 policies, 15 crons, 88 edge fns.
- `database/trigger-functions.sql` — 48 funções.

### Auditoria congelada (`docs/audit/`)
90 fichas de edge functions, 13 de integrações, análises de dívida técnica e cron. **Não modificar.**

---

## 2. O que é gerado automaticamente

| Arquivo | Origem | Como regenerar |
|---|---|---|
| `reference/database/database-full.md` | Banco vivo | Queries no rodapé do arquivo |
| `reference/database/trigger-functions.sql` | `pg_proc` | Query no rodapé |

Tudo mais é mantido manualmente com base em evidência (código, banco, auditoria).

---

## 3. Pendências

### Documentação
- `reference/api/` — vazio, aguardando geração a partir dos edge functions.
- `reference/events/` — vazio, aguardando catálogo de eventos (`integration_inbound_events`, webhook payloads).
- `reference/generated/` — vazio, reservado para OpenAPI e diagramas gerados.
- Runbooks específicos por incidente (hoje só `operations/README.md` genérico).
- Diagramas visuais dos fluxos de `architecture/event-flow.md` (hoje só texto).

### Estruturais
- Sincronizar 261 migrations do repo ↔ 184 aplicadas em prod (Drift #4).
- Padronizar `verify_jwt` nas 88 edge functions (Drift #5).

---

## 4. P0 / P1 / P2 atuais

Fonte: [`operations/drift/2026-07-04.md`](operations/drift/2026-07-04.md).

### 🔴 P0
1. **Duplicação de audit triggers** em `contacts`, `opportunities`, `tasks` — `audit_logs` inchou a 463 MB / 292 K linhas.
2. **Shadow code** — 3 edge functions no dashboard sem par no repo: `marketing-campaign-enrich`, `twilio-message-debug`, `meta-capi-raw-test`.

### 🟡 P1
3. **Migration drift** — 261 arquivos no repo vs 184 aplicadas.
4. **`verify_jwt: false`** em ~88 edge functions sem justificativa por função.
5. **Cron órfão** — `scheduled-messages-cron` sem função correspondente.

### 🟢 P2
6. **Tabelas legadas** — 8 tabelas `*_backfill_*` (ex.: `messages_endpoint_backfill_2b`, 92 K linhas).
7. **SSRF risk** em funções de download de mídia (kommo/nammux) — falta allowlist.
8. **Sentry** parcialmente instrumentado (só front). Backend/edge sem breadcrumbs.

---

## 5. Onde olhar

| Você quer entender... | Vá para |
|---|---|
| Produto (o que o sistema faz) | [`product/`](product/) |
| Módulo específico (contacts, ai-agent, messages…) | [`modules/<nome>/`](modules/) |
| Estrutura do banco (tabelas, triggers, policies) | [`reference/database/database-full.md`](reference/database/database-full.md) |
| Integração externa (WhatsApp, Twilio, Kommo, Meta…) | [`integrations/<nome>/`](integrations/) |
| Decisão arquitetural ("por que assim?") | [`decisions/`](decisions/) |
| Drift ativo (repo ≠ prod) | [`operations/drift/`](operations/drift/) e [`operations/conflicts.md`](operations/conflicts.md) |
| Incidentes / runbooks | [`operations/README.md`](operations/README.md) |
| Ownership de tabela/função por domínio | [`reference/catalog.md`](reference/catalog.md) |
| Histórico congelado da auditoria | [`audit/00-PROGRESS.md`](audit/00-PROGRESS.md) |

---

## 6. Próxima onda recomendada

Nesta ordem:

1. **Resolver P0 #1** — consolidar triggers de audit duplicados e vacuum de `audit_logs`. Documentar no mesmo commit sob `operations/drift/`.
2. **Resolver P0 #2** — trazer as 3 edge functions shadow para o repo (ou removê-las do dashboard). Sem isso, `audit/` e `reference/` mentem sobre a superfície real.
3. **Gerar `reference/events/`** — catalogar payloads de webhook (Twilio, Meta, Kommo, SuvSign) e eventos internos (`integration_inbound_events`). É a maior lacuna hoje entre `architecture/event-flow.md` e o código real.
4. **Gerar `reference/api/`** — extrair contratos das 88 edge functions (input/output + `verify_jwt`), o que resolve parcialmente P1 #4.
5. **Sincronizar migrations (P1 #3)** — reconciliar 261 ↔ 184 antes de qualquer refactor grande.
6. **Runbooks reais** — só depois de 1–5, escrever runbook por incidente concreto observado (não hipotético).
