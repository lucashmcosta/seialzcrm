## Problema
Mesmo bug do `list-orgs`: `admin-impersonate-switch` valida o caller por `admin_users.auth_user_id = user.id`, mas durante a impersonação o JWT é do usuário-alvo → "Acesso negado".

## Correção
Em `supabase/functions/admin-impersonate-switch/index.ts`:

1. Ler `currentSessionId` do body **antes** da autorização.
2. Buscar `impersonation_sessions` por `id = currentSessionId` com `status = 'active'`. Se não existir/ativa → 403.
3. Carregar `admin_users` pelo `admin_user_id` da sessão (em vez de pelo JWT). Validar `is_active` e `mfa_enabled`.
4. Remover toda a lógica baseada em `Authorization` header / `getUser`.
5. Resto do fluxo (encerrar sessão atual, gerar magic link, criar nova sessão, audit log) permanece igual usando o `adminUser` derivado.

Segurança preservada: só funciona com um `currentSessionId` ativo (que foi criado por `impersonate-start` após MFA do admin).
