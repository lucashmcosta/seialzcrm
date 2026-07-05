# Platform — Security

**Fonte:** `docs/audit/05-multi-tenancy.md`, `docs/audit/07-divida-tecnica.md`, `docs/reference/database/database-full.md`, `docs/operations/drift/2026-07-04.md`.

## Modelo de auth
- Usuário CRM: Supabase Auth → `users` (via `auth_user_id`).
- Admin plataforma: `admin_users` (auth separada + MFA obrigatório).
- Impersonação: `impersonation_sessions` + auditoria em `admin_audit_logs`.

## Isolamento
- Toda tabela de negócio scopeada por `organization_id` via RLS.
- **232 policies RLS, cobertura total** — 0 tabelas expostas (dado do banco vivo).
- Sem `anon` em tabelas de negócio.
- Roles em tabela dedicada (`permission_profiles` + `user_organizations`).

## Sessão
- Sessão única por device.
- Hook `useSingleSession` invalida sessões concorrentes.

## Compliance
- Bloqueios em `compliance_blocks`, log em `src/lib/complianceLog.ts`.
- Guards em `src/lib/complianceGuards.ts`.

## Cripto de credenciais
- `_shared/crypto.ts` — `encryptSecret` / `decryptSecret` para credenciais externas em `organization_integrations` (JSONB cifrado).
- ⚠️ `get_meta_credentials(p_org_id)` retorna token criptografado — auditar callers.

## Segredos de plataforma
- Nunca armazenados em tabelas (regra).
- Vault do Supabase para `service_role` + tokens de cron.
- `get_internal_function_auth_token()` → chamadas edge → edge autenticadas.
- Env vars para functions: `LOVABLE_API_KEY`, `VOYAGE_API_KEY`, `SENTRY_DSN`, `INTEGRATION_WORKER_TOKEN`, `INTELLIGENCE_WORKER_TOKEN`, `META_GRAPH_API_VERSION`.

## `verify_jwt=false` em ~todas as 88 functions (drift #5)

Pode ser intencional (auth própria em `_shared/auth.ts`, webhooks externos precisam de `false`), mas exige confirmação function por function. Prioridade: `admin-impersonate*`, `create-user`, `byok-*`.

**Matriz criada (2026-07-05):** [`verify-jwt-review.md`](verify-jwt-review.md) — 93 functions classificadas em 5 grupos. Resultado: 🔴 grupo "sem autenticação de chamador" inclui `twilio-whatsapp-send`, `meta-whatsapp-send`, `ai-agent-respond` e `twilio-webhook` (sem assinatura). Correções de código pendentes de proposta/revisão.

## Dívida crítica (🔴)

- **SSRF** em `import-from-url`, `kommo-media-download`, `nammux-download-attachment`, `kommo-*` fetch. Falta allowlist de host.
- **Sanitização de subdomínio Kommo** ausente em várias functions.
- **Anon key inline** em migration do cron `integration-worker`.
- **Edge functions fora do repo** (`marketing-campaign-enrich`, `twilio-message-debug`, `meta-capi-raw-test`) — código de produção sem versionamento.

Ver `docs/audit/07-divida-tecnica.md` e `docs/operations/drift/2026-07-04.md`.

## Regras não-negociáveis
- `service_role_key` **nunca** no frontend nem como caller token.
- Frontend sempre com `VITE_SUPABASE_PUBLISHABLE_KEY` (anon).
- Edge functions acessam privilégio elevado via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.
- **Deploy de edge function apenas via repo** — nunca dashboard (ADR-0007).
- **Nenhuma trigger de auditoria/denormalização nova sem ADR próprio** (histórico: triggers duplicadas geraram 463 MB em `audit_logs`).
