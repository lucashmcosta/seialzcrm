# ADR 0002 — Superfície admin separada (`admin_users` + MFA obrigatório)

**Status:** Aceito.
**Evidência:** `src/hooks/useAdminAuth.ts`, `src/components/admin/AdminProtectedRoute.tsx`, tabelas `admin_users` / `admin_sessions` / `admin_audit_logs`.

## Contexto
Administradores da plataforma Seialz operam sobre orgs de terceiros e precisam de garantias mais fortes que usuários CRM.

## Decisão
- Auth admin desacoplada da auth CRM — tabela própria `admin_users`.
- MFA obrigatório: se `mfa_enabled=false` ou `mfa_setup_completed_at=null` → `/admin/mfa-setup`.
- Acesso cross-org apenas via impersonação (`admin-impersonate*`), sempre auditado em `admin_audit_logs`.
- `AdminLayout` distinto de `Layout` para evitar confusão visual.
- `OutboundCallProvider` desativa Twilio Voice em `/admin/*` para não vazar device entre orgs.

## Consequências
- Duas superfícies de auth ao mesmo tempo (dívida 🟡: documentar contrato).
- Impersonação bem auditada.
- Dívida 🟢: `admin-impersonate-end` não grava `admin_audit_logs` no fim — corrigir.
