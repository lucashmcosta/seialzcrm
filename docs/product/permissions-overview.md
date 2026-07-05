# Permissões — visão geral

Fonte: `docs/audit/05-multi-tenancy.md`, tabelas `user_organizations`, `permission_profiles`, `admin_users`, `impersonation_sessions`.

## Superfícies de auth

| Superfície | Contexto React | Fonte de identidade |
|---|---|---|
| Usuário CRM | `AuthContext` (`src/contexts/AuthContext.tsx`) | `auth.users` → `users.auth_user_id` |
| Admin de plataforma | `useAdminAuth` (`src/hooks/useAdminAuth.ts`) | `admin_users` (auth separada + MFA obrigatório) |

Regra Core: **nunca usar `auth.uid()` diretamente em relacionamentos** — sempre `users.id` derivado por `current_user_id()`.

## Multi-tenancy

- `user_organizations` (user_id, organization_id, role, ...) vincula usuário ↔ organização.
- `permission_profiles` atribuídos via `user_organizations`.
- Função SECURITY DEFINER `current_user_org_ids()` retorna array de UUIDs → padrão de RLS:
  ```sql
  organization_id = ANY(current_user_org_ids())
  ```
- `has_role(_user_id, _role)` para checagens de role sem recursão.

## Roles

- Roles vivem em tabela separada por design (política do projeto). Nunca armazenar role em `users`/`profiles`.
- Ver `permission_profiles` para os perfis atribuíveis.

## Impersonação

- `impersonation_sessions` marca sessão ativa quando um admin assume uma org.
- Várias policies incluem `OR EXISTS (SELECT 1 FROM impersonation_sessions ...)` para leitura cross-org durante impersonação.
- Toda ação registrada em `admin_audit_logs`.
- Encerramento via `admin-impersonate-end`. Divergência conhecida (dívida 🟢): essa função não grava `admin_audit_logs` no encerramento — ver `audit/07-divida-tecnica.md`.

## Isolamento por canal

- `communication_endpoints` scopeada por org. Webhooks Meta/Twilio precisam olhar `waba_id`/`messaging_service_sid` para descobrir a org destino (memory `integrations/twilio-whatsapp-cross-org-routing`).
- Twilio Voice: `OutboundCallProvider` desativa Voice em `/admin/*` (memory `integrations/twilio-voice-security-isolation`).
- WhatsApp Templates: admin only por design.

## Grants padrão em tabelas de negócio

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO authenticated;
GRANT ALL ON public.<t> TO service_role;
-- sem GRANT para anon (tabelas de negócio)
```
