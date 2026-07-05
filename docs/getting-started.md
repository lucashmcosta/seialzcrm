# Getting Started

Guia mínimo para colocar o ambiente de desenvolvimento em pé. Baseado em `package.json`, `.env.example`, `vercel.json`, `supabase/config.toml` e `docs/platform/deployment/`.

## Pré-requisitos

- **Node.js 24.x** (`engines` em `package.json`).
- **npm** (o repo versiona `package-lock.json`; o build da Vercel usa `bun install --frozen-lockfile` — localmente npm funciona normalmente).
- Acesso ao projeto Supabase `qvmtzfvkhkhkhdpclzua` (produção — **não há ambiente de staging**; ver Cuidados abaixo).
- `[TODO]` Supabase CLI para desenvolvimento local (`supabase start`) — fluxo local ainda não padronizado no projeto; hoje o desenvolvimento aponta direto para o banco de produção via chave anon + RLS.

## Setup local

```sh
git clone <repo>
cd seialzcrm
npm install
cp .env.example .env   # preencher com os valores reais
npm run dev            # Vite em modo dev
```

Outros scripts: `npm run build` (produção), `npm run build:dev`, `npm run lint`, `npm run preview`.

## Variáveis de ambiente

Documentadas em [`.env.example`](../.env.example) (fonte de verdade). Resumo:

| Variável | Escopo | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend | Chave anon (publishable) — segura para expor |
| `VITE_SUPABASE_PROJECT_ID` | Frontend | Project ref (usado pelo media proxy) |
| `VITE_SENTRY_DSN` | Frontend | Opcional; tem fallback hardcoded |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | Build (Vercel) | Upload de sourcemaps; se ausentes, o plugin é desativado e o build segue |

**Regras invioláveis** (ver [`platform/security/`](platform/security/README.md)): `service_role_key` nunca no frontend; edge functions leem segredos via `Deno.env.get(...)`.

Segredos de edge functions (`LOVABLE_API_KEY`, `VOYAGE_API_KEY`, `SENTRY_DSN`, `INTEGRATION_WORKER_TOKEN`, `INTELLIGENCE_WORKER_TOKEN`, `META_GRAPH_API_VERSION`) são gerenciados via secrets do Supabase/Lovable — nunca em tabelas nem no repo.

## Frontend

- React 18 + Vite 5 + TypeScript, Tailwind + shadcn/Radix, react-router v6 — visão completa em [`architecture/overview.md`](architecture/overview.md).
- Design system: leitura obrigatória de [`product/design/design-system.md`](product/design/design-system.md) e [`product/design/icon-system.md`](product/design/icon-system.md) antes de escrever UI (cores só via tokens semânticos; peso máx de fonte 600).
- Cliente Supabase em `src/integrations/supabase/` (types gerados pela CLI em `types.ts`).

## Supabase

- Projeto: `qvmtzfvkhkhkhdpclzua` (config em `supabase/config.toml`).
- Todas as tabelas de negócio têm RLS `organization_id = ANY(current_user_org_ids())` ([ADR-0001](decisions/0001-multi-tenancy-organization-id.md)).
- Snapshot completo do schema: [`reference/database/database-full.md`](reference/database/database-full.md).
- `config.toml` declara `verify_jwt = false` por função — a auth é feita dentro da função (`_shared/auth.ts`, assinatura de webhook ou token interno). Ver drift #5 em [`operations/drift/`](operations/drift/2026-07-04.md).

## Migrations

- Ficam em `supabase/migrations/` — **geridas pela ferramenta de migration** (não criar/editar arquivos à mão, ver [`platform/deployment/`](platform/deployment/README.md)).
- **Regra do Drift ([ADR-0007](decisions/0007-drift-rule.md), inegociável):** mudança manual no banco de produção exige migration commitada no mesmo dia; mudou schema/trigger/RPC → regenerar `reference/database/` no mesmo PR.
- ⚠️ Estado atual: 261 migrations no repo vs 184 aplicadas em produção (drift #4) — reconciliar antes de qualquer refactor grande.
- `[INCERTO]` Fluxo exato de aplicação de migrations novas (CLI `supabase db push` vs ferramenta Lovable) — confirmar antes da primeira migration.

## Edge Functions

- Código em `supabase/functions/` (88 deployadas; fichas históricas em `audit/02-edge-functions/`).
- Deploy automático pela plataforma Lovable ao editar arquivos em `supabase/functions/` — **nunca deployar pelo dashboard do Supabase** (foi assim que nasceram 3 funções shadow fora do repo, drift #2).
- Utilidades compartilhadas em `supabase/functions/_shared/` (auth, crypto, dispatch WhatsApp, handlers de integração).

## Deploy

- **Frontend:** Vercel, deploy automático a cada push (build `bun run build`, SPA rewrite e headers em `vercel.json`). Sourcemaps sobem para o Sentry quando as vars `SENTRY_*` estão configuradas.
- **Edge functions / DB:** via repo (Lovable), conforme seções acima.
- URLs: produção `https://seialz.com` (custom domain de `https://seialzcrm.lovable.app`); preview Lovable — ver [`platform/deployment/`](platform/deployment/README.md).

## Troubleshooting

- **Primeiro passo em incidente:** tabela sintoma → diagnóstico no runbook de [`operations/README.md`](operations/README.md).
- **"Dados faltando" em listagem:** Supabase retorna 1000 rows por query por default — checar antes de assumir bug.
- **Tela quebrada após deploy:** chunks lazy expirados — `retryImport` em `src/App.tsx` já retenta 2×; hard refresh resolve.
- **Health checks:** `/health` e `/dev/health` (frontend), edge fns `health` e `outbox-health`.
- **Cuidado:** o banco é produção. Nunca rodar INSERT/UPDATE em massa sem ler "Janelas e cuidados" em `operations/README.md` (`messages` tem 12 triggers; workers rodam a cada 30s).
