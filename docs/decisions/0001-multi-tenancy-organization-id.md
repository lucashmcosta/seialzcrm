# ADR 0001 — Multi-tenancy via `organization_id` + RLS `ANY(current_user_org_ids())`

**Status:** Aceito (em produção).
**Evidência:** `docs/audit/05-multi-tenancy.md`, `<supabase-tables>`, memory Core.

## Contexto
Modelo SaaS multi-org. Um usuário pode pertencer a várias organizações via `user_organizations`.

## Decisão
- Toda tabela de negócio carrega `organization_id`.
- RLS obrigatória: `organization_id = ANY(current_user_org_ids())`.
- `current_user_org_ids()` é SECURITY DEFINER e retorna `uuid[]` — força Postgres a usar InitPlan (evita per-row).
- Nunca usar `auth.uid()` direto em relacionamentos — usar `users.id` derivado.

## Consequências
- Isolamento consistente e cacheável pelo planner.
- Impersonação exige policy adicional lendo `impersonation_sessions`.
- Novo módulo → checklist: `GRANT` explícito + `ENABLE RLS` + policy `ANY(current_user_org_ids())`.
