# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Seialz é um CRM multi-tenant (WhatsApp/Meta, Inbox, agente de IA, BYOK, telefonia Twilio, portal do cliente). Projeto originado no Lovable: commits feitos pelo Lovable caem direto no `main`. A documentação do repo e os commits são em português.

## Comandos

O lockfile é `bun.lock` (a Vercel roda `bun install --frozen-lockfile`). Não gere nem commite `package-lock.json`. Se o `bun` não estiver instalado, `npx bun <cmd>` funciona.

```sh
bun install
bun run dev                  # Vite
bun run build                # vite build + scripts/build-legal-pages.mjs
bun run lint                 # eslint — tem ~826 erros pré-existentes, fora do CI
npm run docs:validate        # valida links/refs em docs/ (roda no CI)
```

Testes (não existe script `test` no `package.json` raiz):

- **Frontend/libs** — `bun:test`, em `tests/*.test.ts` e `src/**/*.test.ts`:
  `bun test tests/thread-status.test.ts` (um arquivo) · `bun test tests/` · `bun test -t "<nome>"`
- **Edge functions** — `Deno.test`, em `supabase/functions/**/*.test.ts`: `deno test <arquivo>` (o Deno não vem instalado por padrão).
- **SQL** — `tests/sql/*.sql` são scripts `psql` que criam o mínimo de schema, aplicam uma migration via `\ir` e verificam com `RAISE EXCEPTION`, dentro de transação. Rodar só contra Postgres descartável, nunca produção.
- **`packages/motor-classificacao`** — pacote isolado (vitest + esbuild, `npm ci && npm test`). O build `dist/motor.mjs` precisa ser **byte a byte igual** a `supabase/functions/_shared/classificacao/motor.mjs` (o CI checa com `cmp`). O motor é validado pelo jurídico: não altere a lógica.

O CI (`.github/workflows/ci.yml`) também roda `bun test src/components/process-classification src/lib/permissions`, `bun run build` e `node scripts/check-seller-bundle.mjs`. Esse último garante que o bundle do navegador não carregue calibração nem cálculo do motor de classificação.

## Ambiente: não há staging

`.env` aponta para o projeto Supabase de **produção** (`qvmtzfvkhkhkhdpclzua`, "Seialz DB"). O dev local usa a chave anon + RLS contra o banco real. Nada de INSERT/UPDATE em massa sem ler `docs/operations/README.md`: `messages` tem 12 triggers e há workers rodando a cada ~30s.

## Arquitetura

- **Frontend**: SPA React 18 + Vite + TS, Tailwind + shadcn/Radix, react-router v6 (rotas em `src/App.tsx`, lazy com `retryImport`). Contextos globais em `src/contexts/` (Auth, Organization, …). O cliente Supabase e os tipos gerados ficam em `src/integrations/supabase/`. O react-query só é usado em partes do app; o resto usa `useState`/`useEffect`.
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions Deno em `supabase/functions/`, código compartilhado em `_shared/`). `config.toml` usa `verify_jwt = false` por função: a auth acontece **dentro** da função (`_shared/auth.ts`, assinatura de webhook ou token interno de worker).
- **Multi-tenancy**: toda tabela de negócio tem `organization_id` e RLS `organization_id = ANY(current_user_org_ids())` (ADR-0001). Tabela nova = `GRANT` explícito + `ENABLE RLS` + essa policy.
- **Inbound**: webhooks (`meta-whatsapp-webhook`, `twilio-*`, `lead-webhook`, …) só enfileiram em `integration_inbound_events`. O `integration-inbound-dispatcher` consome por claim/lease. Ainda coexiste um caminho legado que grava direto em `messages`.
- **Outbound/integrações**: `integration_jobs` → `integration-worker` (token `INTEGRATION_WORKER_TOKEN`), com handlers registrados em `_shared/integration-handlers/registry.ts`. Jobs periódicos rodam via `pg_cron` + `pg_net`.
- **IA**: Anthropic/OpenAI/Gemini via BYOK (credencial da org) ou Lovable AI Gateway; embeddings/rerank com Voyage.
- **i18n**: o CRM usa `src/lib/i18n.ts`, e o site institucional tem um i18n separado em `src/i18n/` + `src/locales/{pt-BR,en}`.
- **Inbox × Messages** são módulos separados por decisão de negócio (`docs/product/channel-boundaries.md`). Não proponha fundi-los.
- Antes de escrever UI, leia `docs/product/design/design-system.md` e `icon-system.md`: cores só por tokens semânticos, peso máximo de fonte 600.

## Regras de banco, deploy e drift (ADR-0007, inegociável)

- Mudança de schema/trigger/RPC entra como migration em `supabase/migrations/`. No mesmo PR: regenerar `docs/reference/database/` (é gerado, não se edita à mão) e atualizar `docs/reference/catalog.md` e o `data-model.md` do módulo.
- Nunca faça deploy de edge function pelo dashboard do Supabase: o deploy sai do repo. Mudança manual em produção exige migration commitada no mesmo dia.
- Backfill/tabela temporária vai no schema `_scratch`, nunca em `public`.
- Trigger nova de auditoria/denormalização precisa de ADR próprio.
- Nova edge function → linha em `docs/reference/catalog.md`. Nova rota → `docs/product/modules.md` e `navigation-map.md`. Nova env var → `.env.example` + `docs/getting-started.md`. Decisão arquitetural → ADR em `docs/decisions/`.
- `docs/audit/**` é congelado. Divergência entre doc e realidade vai para `docs/operations/drift/YYYY-MM-DD.md`.
- Supabase retorna no máximo 1000 linhas por query por padrão. Considere isso antes de concluir que "faltam dados".

## Decisões registradas em AGENTS.md

- Edição de mensagem Evolution passa **só** pela edge `evolution-edit-message` + RPC `rpc_apply_message_edit_v1` (service_role). `message_edit_history` não é legível pelo frontend.
- Widgets: o catálogo fica só em `src/widgets/registry.ts`. Widgets são globais (liga/desliga em `organization_widgets`, sem config por tela), layout/pins são por usuário, e o Workspace é montado uma vez fora das rotas, com **um** canal Realtime por org. Canais duplicados já derrubaram as conversas.
- Perfil de sistema da org = `permission_profiles.is_system` (checar com `is_org_system_admin`), nunca pelo nome "Admin". Triggers de proteção liberam só execução interna (`current_user NOT IN (authenticated, anon)`).
- `client-portal-otp-send` envia o OTP direto pela Meta, sem tocar em `message_threads`/`messages`, e audita só em `client_portal_otp_log`. O código não pode aparecer na Inbox.
- Chat do App do cliente: as conversas vivem no projeto do App. O Seialz guarda só o último estado em `client_portal_chat_events` (sem texto) e fala com `portal-staff` exclusivamente via `client-portal-staff-proxy`, porque o segredo HMAC não pode ir ao navegador.

## Onde procurar

`docs/README.md` é o mapa da documentação: módulos em `docs/modules/`, integrações em `docs/integrations/`, runbooks em `docs/operations/`, ADRs em `docs/decisions/`, schema em `docs/reference/database/`. A documentação deve ser autossuficiente: não cite memórias de agente nos docs.
