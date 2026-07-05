# Platform — Security

**Fonte:** `docs/audit/05-multi-tenancy.md`, `07-divida-tecnica.md`.

## Modelo de auth
- Usuário CRM: Supabase Auth → `users` (via `auth_user_id`).
- Admin plataforma: `admin_users` (auth separada + MFA obrigatório).
- Impersonação: `impersonation_sessions` + auditoria em `admin_audit_logs`.

## Isolamento
- Toda tabela de negócio scopeada por `organization_id` via RLS.
- Sem `anon` em tabelas de negócio.
- Roles em tabela dedicada (`permission_profiles` + `user_organizations`).

## Sessão
- Sessão única por device (memory `integrations/single-session-device-based`).
- `useSingleSession` hook invalida sessões concorrentes.

## Compliance
- Bloqueios em `compliance_blocks`, log em `src/lib/complianceLog.ts`.
- Guards em `src/lib/complianceGuards.ts`.

## Cripto de credenciais
- `_shared/crypto.ts` — `encryptSecret` / `decryptSecret` para credenciais externas em `organization_integrations` (JSONB cifrado).

## Segredos de plataforma
- Nunca armazenados em tabelas (regra).
- Vault do Supabase para `service_role` + tokens de cron.
- Env vars para functions: `LOVABLE_API_KEY`, `VOYAGE_API_KEY`, `SENTRY_DSN`, `INTEGRATION_WORKER_TOKEN`, `INTELLIGENCE_WORKER_TOKEN`, `META_GRAPH_API_VERSION`.

## Dívida crítica (🔴)
- **SSRF** em `import-from-url`, `kommo-media-download`, `nammux-download-attachment`, `kommo-*` fetch. Falta allowlist de host.
- **Sanitização de subdomínio Kommo** ausente em várias functions.
- **Anon key inline** em migration do cron `integration-worker`.

Ver `docs/audit/07-divida-tecnica.md`.

## Regras não-negociáveis
- `service_role_key` **nunca** no frontend nem como caller token.
- Frontend sempre com `VITE_SUPABASE_PUBLISHABLE_KEY` (anon).
- Edge functions acessam privilégio elevado via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.
