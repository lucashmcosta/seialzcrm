# Módulo: Admin (plataforma)

Superfície separada com MFA obrigatório. Layout `AdminLayout`.

## Rotas
`/admin`, `/admin/organizations[/:id]`, `/admin/logs`, `/admin/users`, `/admin/feature-flags`, `/admin/security`, `/admin/impersonations`, `/admin/plans`, `/admin/coupons`, `/admin/integrations[/:id]`, `/admin/integration-health`, `/admin/documentation[/:module]`, `/obs`, `/admin/obs`.

## Guards
- `AdminProtectedRoute` — valida via `useAdminAuth` + sessão Supabase separada.
- Se `mfa_enabled=false` ou `mfa_setup_completed_at=null` → força `/admin/mfa-setup`.

## Impersonação
Edge functions: `admin-impersonate`, `admin-impersonate-switch`, `admin-impersonate-end`, `admin-list-orgs-for-switch`. Registro em `impersonation_sessions` + `admin_audit_logs`.
Callback público: `/impersonate/callback`.

## Notificações
`admin_notifications` (7 col) — enviadas via `_shared/notify.ts`.
