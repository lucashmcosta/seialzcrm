# Dívida Técnica — Consolidado

Priorização subjetiva: 🔴 alta, 🟡 média, 🟢 baixa.

## Segurança

- 🔴 **SSRF em `import-from-url`, `kommo-media-download`, `nammux-download-attachment`, `kommo-fetch-pipelines`, `kommo-preview`, `kommo-migrate`, `kommo-validate`** — `fetch(URL)` de origem controlada por usuário/dado externo, sem allowlist de host nem sanitização. Impacto: request forgery contra hosts internos do próprio Supabase/Railway. Ação: validar host contra allowlist e/ou usar helper central em `_shared/`.
- 🔴 **Sanitização de subdomínio Kommo** ausente em várias functions (memory `development/edge-function-subdomain-sanitization` reconhece o padrão como obrigatório). Adicionar helper `sanitizeKommoSubdomain()` em `_shared/`.
- 🟡 **Anon key inline em migration de cron** (`integration-worker`) — se a anon key for rotacionada, o cron quebra. Migrar para `get_internal_function_auth_token()`.
- 🟡 **`nammux-audit`** chama `httpbin.org` — remover em produção; usar logging interno.
- 🟡 **`viagi-staging-loader`** importa `npm:@supabase/supabase-js@2/cors` (subpath inexistente). Provavelmente quebrado; deletar se one-shot já rodou.
- 🟢 **`admin-impersonate-end`** não grava `admin_audit_logs` no encerramento — divergência com `admin-impersonate`/`admin-impersonate-switch`.

## Arquitetura

- 🔴 **`ai-agent-respond` monolítico** (2372 LOC). Extrair: provedores (Claude/OpenAI/Gemini) para módulos separados em `_shared/agent/providers/`, ferramentas (schedule, memory, payment) para `_shared/agent/tools/`, RAG para `_shared/agent/rag.ts`. Facilita testes e reduz risco de regressão.
- 🔴 **Três funções paralelas de processamento de knowledge:** `process-knowledge`, `process-knowledge-item`, `reprocess-knowledge`. Consolidar em uma com modo (`full` / `single` / `reprocess`).
- 🟡 **`kommo-migrate` monolítico** (575 LOC). Quebrar por entidade (contacts, opportunities, activities, tasks) mantendo `import_logs` como fonte única.
- 🟡 **Duplicação de criação de lead** entre `lead-webhook`, `meta-whatsapp-webhook`, `meta-lead-ads-process-lead`. Extrair para `_shared/leads/create-or-dedupe.ts`.
- 🟡 **react-query subutilizado** no frontend — só usado em `src/pages/marketing/*`. Migrar hooks de `contacts`, `opportunities`, `messages`, `tasks` para react-query traria cache/invalidação consistentes e removeria muito boilerplate `useState/useEffect`.
- 🟢 **`App.tsx` gigante** (~600 LOC de rotas). Extrair `AdminRoutes`, `SettingsRoutes`, `MarketingRoutes` para arquivos próprios.
- 🟢 **Dois hooks wrapper triviais** (`useAuth.ts`, `useOrganization.ts`) — podem ser removidos após migração dos consumidores para o contexto direto.

## Observabilidade

- 🔴 **Sem Sentry em edge functions críticas.** Somente `health` referencia `SENTRY_DSN`. Instrumentar `ai-agent-respond`, `meta-whatsapp-webhook`, `twilio-whatsapp-webhook`, `suvsign-webhook`, `integration-worker`, `intelligence-worker`, `meta-lead-ads-*`.
- 🟡 **Cron sem alerta** — falhas em `pg_cron` só aparecem se alguém consultar `cron.job_run_details`. Configurar job `outbox-health`/`cron-health` reportando para Sentry ou notificação admin.

## Schema / dados

- 🟡 **Tabelas `backup_*` e `*_backfill_*`** múltiplas no schema (ver `<supabase-tables>`). Auditar quais ainda são consumidas; arquivar/dropar o resto.
- 🟡 **`viagi_csv_staging_2026_05_28`** — table name versionada por data, foge da convenção multi-tenant. Se o backfill já rodou, dropar; caso contrário renomear.
- 🟡 **`opportunities_status_backup_20260512`** — backup one-shot ainda no schema.
- 🟢 **`message_threads_business_context_backfill*`** — três tabelas de backfill do mesmo tema. Consolidar ou remover pós-execução.
- 🟢 **`theme_preset`** lida com cast `as any` em `ThemeContext` — regenerar `src/integrations/supabase/types.ts`.

## Auth / Sessão

- 🟡 **Duas superfícies de auth** (`AuthContext` vs `useAdminAuth`) — funcional mas guarda-corpo é frágil. Documentar contrato de que admins nunca acessam rotas CRM sem `admin_impersonate`.
- 🟡 **`signOut` não reseta contextos filhos** — pode causar flash de conteúdo antigo antes do redirect. Adicionar reset explícito em `OrganizationContext`/`ThemeContext` ao detectar `user=null`.

## Frontend / UX

- 🟢 **`retryImport` faz reload da página** no fallback — perde estado. Aceitável para chunk expirado, mas UX poderia ser um toast "Nova versão disponível, recarregando…".
- 🟢 **Falta `ErrorBoundary` global** aparente em `App.tsx`. Adicionar boundary raiz + por rota crítica (Inbox, Kanban).

## Custos / performance

- 🟡 **`integration-worker` e `intelligence-worker` a cada 30s** — RPC contínuo mesmo em orgs ociosas. Considerar back-off adaptativo ou pausar quando `intelligence_jobs`/`integration_jobs` estão vazios por N ciclos.
- 🟡 **`ai-agent-respond` sem cache de embeddings de queries recentes** — cada mensagem faz nova busca. Cache em memória por thread reduz custo Voyage.
- 🟢 **`export-conversations`** sem paginação/streaming — arriscado para orgs grandes; usar streaming CSV.

## Documentação viva

- 🟢 Muitas memories cobrem o comportamento — considerar publicar um `docs/ARCHITECTURE.md` de alto nível apontando para essas memories, para onboarding de novos devs.

## Prioridades sugeridas (curto prazo)

1. Fechar SSRF em `import-from-url`, `kommo-*`, `nammux-download-attachment` (🔴).
2. Sanitizar subdomínio Kommo em todas as functions (🔴).
3. Instrumentar Sentry nas 6 functions críticas (🔴).
4. Consolidar `process-knowledge*` em uma função (🔴).
5. Extrair provedores de `ai-agent-respond` para módulos (🔴).
