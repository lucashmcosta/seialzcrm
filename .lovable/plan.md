# Liberar aba "Não atribuídas" para Sales Rep em /messages

Hoje o perfil Sales Rep só enxerga "Minhas" porque a aba "Não atribuídas" é gated por `permissions.viewAllThreads`, e o RPC `rpc_list_message_threads` só retorna threads atribuídas ao próprio usuário quando esse perm é falso. Vamos liberar especificamente conversas SEM dono para qualquer usuário do org, sem dar acesso às atribuídas a outros.

## Mudanças

### 1. Backend — `rpc_list_message_threads` (migration)
Ajustar duas cláusulas para que threads sem `assigned_user_id` sejam sempre visíveis dentro do org:

- `WHERE` de threads:
  - de: `(v_can_view_all_threads OR mt.assigned_user_id = v_user_id)`
  - para: `(v_can_view_all_threads OR mt.assigned_user_id = v_user_id OR mt.assigned_user_id IS NULL)`
- `JOIN contacts`: quando a thread é não atribuída, não exigir que o contato seja do owner. Trocar:
  - de: `(v_can_view_all_contacts OR c.owner_user_id = v_user_id)`
  - para: `(v_can_view_all_contacts OR c.owner_user_id = v_user_id OR mt.assigned_user_id IS NULL)`

Sem mudar `SECURITY DEFINER`, assinatura, nem demais filtros. Atribuídas a outros continuam ocultas para Sales Rep.

### 2. Frontend — `src/pages/messages/MessagesList.tsx`
- Em `allFilterOptions`, remover `requiresViewAll: true` do item `unassigned` (manter em `all_open` e `resolved`).
- No `useEffect` que força `'mine'`, permitir também `'unassigned'`:
  - `if (!permissions.viewAllThreads && effectiveFilter !== 'mine' && effectiveFilter !== 'unassigned') setFilter('mine');`

Sem mexer no Mobile (`MobileMessagesList`) nem no Inbox v2 — fora do escopo do pedido.

## Fora de escopo
- Não altera `usePermissions`, perfis de permissão ou RLS de outras tabelas.
- Não muda visual/abas do `/inbox`, do Atendimento ou do dashboard.
