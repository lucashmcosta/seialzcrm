# Filtro "só sem responsável" nas listas do Atendimento e do Comercial

## O que já existe
- Comercial: `rpc_list_message_threads` **já tem** `p_unassigned_only boolean` em assinatura única. Não será recriada; só confirmamos que, com `true`, restringe a `assigned_user_id IS NULL` dentro da visibilidade atual.
- Atendimento: `rpc_list_inbox_threads` não tem o parâmetro. Assinatura atual:
  `(p_organization_id uuid, p_tab text, p_only_mine boolean, p_assigned_user_id uuid, p_resolved_since timestamptz, p_include_service_endpoints boolean, p_limit integer) RETURNS SETOF jsonb`

## Mudanças
1. Uma migração: `DROP FUNCTION` da versão atual de `rpc_list_inbox_threads` e `CREATE` com o mesmo corpo + `p_unassigned_only boolean DEFAULT false` no fim (assinatura única, sem sobrecarga). Filtro adicional: `AND (NOT p_unassigned_only OR t.assigned_user_id IS NULL)` — só restringe. Mesmos grants, SECURITY, search_path, ordenação e limite. Rollback salvo antes em `docs/platform/security/rbac-v2/rollback/`.
2. Contador do Atendimento (`rpc_inbox_queue_counts`): não muda nesta etapa.
3. Web:
   - `inboxScope.ts`: `ScopeParams.unassignedOnly?` repassado como `p_unassigned_only` (só enviado quando true).
   - Comercial: onde a web hoje filtra "sem responsável" no cliente, passar a usar o `p_unassigned_only` da RPC (`useMessageThreads`, `MessagesList`, `MobileMessagesList`, `AssigneeFilterDialog`), sem mudar a aparência.
   - Atendimento: onde houver lista de sem responsável (`MobileInbox`, `InboxPage`), usar o novo parâmetro.

## Verificação (simulação em transação com ROLLBACK, usuários reais não-Admin e Admin)
- Sem o parâmetro: resultado idêntico ao atual (comparação de ids antes × depois, por usuário e aba).
- Com `true`: todas as linhas têm responsável nulo e são subconjunto do resultado sem filtro.
- Registro no log e assinaturas finais para o time do app.

## Assinaturas finais (para o app)
- `rpc_list_inbox_threads(p_organization_id uuid, p_tab text, p_only_mine boolean, p_assigned_user_id uuid, p_resolved_since timestamptz, p_include_service_endpoints boolean, p_limit integer, p_unassigned_only boolean DEFAULT false) RETURNS SETOF jsonb`
- `rpc_list_message_threads` — inalterada (já aceita `p_unassigned_only`).
