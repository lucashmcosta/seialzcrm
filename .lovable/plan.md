## Problema

Confirmado nos logs da edge function: `admin-list-orgs-for-switch` retorna `Acesso negado` em todas as chamadas.

Causa: durante a impersonação o usuário autenticado no Supabase é o **usuário-alvo**, não o admin. A função valida o caller via `admin_users.auth_user_id = user.id`, então sempre falha — e o popover mostra "Nenhuma organização encontrada".

## Correção

Trocar a autorização para usar o `sessionId` da impersonação (que o frontend já tem):

### 1. `src/components/admin/ImpersonationBanner.tsx`
Em `loadOrgs()`, passar o `sessionId` no body:
```ts
const { data, error } = await supabase.functions.invoke('admin-list-orgs-for-switch', {
  body: { sessionId },
});
```

### 2. `supabase/functions/admin-list-orgs-for-switch/index.ts`
Substituir a validação atual por:
- Ler `sessionId` do body.
- Buscar `impersonation_sessions` por `id = sessionId` com `status = 'active'` e `ended_at IS NULL`.
- Se não existir, retornar 403.
- Caso exista, prosseguir com a listagem de organizações (mesma query atual com service role).

Isso mantém a segurança (só funciona com um session id válido + ativo, criado pelo fluxo de impersonate-start que já valida MFA/admin) e funciona mesmo com o JWT do usuário-alvo.

## Por que não usar o JWT do admin

Após o login via magic link de impersonação, a sessão do admin foi descartada — só sobra a sessão do alvo. O `impersonation_sessions.id` é o único elo confiável com o admin original.
