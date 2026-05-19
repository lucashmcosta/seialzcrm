# Troca rápida entre tenants (Admin) — v2

Validado: mudanças são **100% aditivas**, sem migration de banco, sem alterar edge functions existentes nem layouts. O `ImpersonationBanner` já é montado globalmente no CRM, então o switcher aparece em qualquer rota sem mexer em `Layout`/`MobileLayout`.

## UX

No `ImpersonationBanner` (topo do CRM enquanto impersona):

```text
[⚠] Logado como N Junior · Org: [Viagi ▼]   [Encerrar Sessão]
```

- Clicar no chip da org abre `Popover` + `Command` com busca.
- Selecionar organização → encerra sessão atual + abre próxima no mesmo tab (`window.location.href`).
- Funciona em qualquer rota do CRM.

## Mudanças

### 1. Edge function `admin-impersonate-switch` (nova)
Reaproveita a lógica das funções existentes:
- Valida admin: `admin_users` + `mfa_enabled=true` + `is_active=true` (mesmo bloco do `admin-impersonate`).
- Encerra `currentSessionId`: copia o bloco de `admin-impersonate-end` (`ended_at`, `duration_seconds`, `status='ended'`).
- Escolhe usuário alvo: `user_organizations` da org com `is_active=true`, ordenado por `created_at ASC` → pega o primeiro. Se vazio → erro 400 "Organização sem usuário ativo".
- Gera magic link (`auth.admin.generateLink` igual ao `admin-impersonate`), insere nova `impersonation_sessions`, grava `admin_audit_logs` com `action='impersonate_switch'` e `details={ from_org_id, to_org_id, previous_session_id }`.
- Retorna `{ action_link, session_id }`.
- CORS conforme padrão do projeto (`'Access-Control-Allow-Origin': '*'`).

### 2. Edge function `admin-list-orgs-for-switch` (nova, leve)
- Valida admin (mesmo check).
- `SELECT id, name, slug, logo_url FROM organizations ORDER BY name`.
- Filtra apenas as que têm pelo menos 1 `user_organizations.is_active=true` (subquery), para evitar erro no clique.
- Retorna array.

### 3. `src/components/admin/ImpersonationBanner.tsx` (único arquivo do frontend tocado)
- Estender o `select` de `impersonation_sessions` para trazer `organization_id` e join com `organizations(name)`.
- Adicionar `<Popover>` com `<Command>` (já temos em `@/components/ui/command`) — lista carregada lazy no `onOpenChange(true)`.
- Item selecionado:
  1. `loading=true`
  2. `invoke('admin-impersonate-switch', { currentSessionId, targetOrganizationId, redirectUrl: window.location.origin })`
  3. `localStorage.removeItem('impersonation_session_id')` (o novo será setado pelo `?imp_session=` no redirect, igual ao fluxo atual)
  4. `await supabase.auth.signOut()`
  5. `window.location.href = action_link`
- Botão "Encerrar Sessão" permanece intacto.

### Nenhum impacto em
- `admin-impersonate`, `admin-impersonate-end` → não tocados.
- RLS, schema, triggers → não tocados.
- Layouts `Layout`/`MobileLayout`/`AdminLayout` → não tocados.
- Outras telas admin → não tocadas.

## Verificação
1. Logar como admin → impersonar Viagi → banner mostra chip "Viagi ▼".
2. Abrir popover → buscar "Central" → clicar.
3. Tab recarrega já como usuário ativo da Central Trabalhista.
4. Conferir em `impersonation_sessions`: sessão antiga `status=ended` com `duration_seconds`, nova sessão `status=active`.
5. Conferir em `admin_audit_logs`: registro `impersonate_switch` com `from_org_id`/`to_org_id`.
6. Tela admin original (`AdminOrganizationDetail` → Impersonar) continua funcionando idêntica.
