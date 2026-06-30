# Busca server-side em /messages

A migration que adiciona `p_search` à `rpc_list_message_threads` já foi aplicada (filtra por `full_name`, `phone` e `phone_normalized` por dígitos; mantém cursor, permissões, lifecycle ≠ customer e todos os demais filtros intactos).

Falta apenas a parte de frontend — preciso de **build mode** para editar.

## Mudanças de código previstas

### 1. `src/hooks/useMessageThreads.ts`
- Aceitar `search?: string` em `UseMessageThreadsOptions`.
- Passar `p_search` na chamada inicial e no `loadMore` da RPC.
- Quando `search` muda, resetar `threads`, `hasMore` e refazer a query (sem cursor).
- Incluir `search` na `channelKey`/deps para forçar refetch.

### 2. `src/pages/messages/MessagesList.tsx`
- Debounce de `searchQuery` (~300 ms) → `debouncedSearch`.
- Passar `debouncedSearch` em `useMessageThreads({ channels: ['whatsapp'], search: debouncedSearch })`.
- Remover o filtro client-side por `searchQuery` em `filteredThreads` (linha 1207) — agora vem do servidor.
- Manter intactos os filtros locais de tab (`all_open`/`mine`/`unassigned`/`resolved`), `endpointFilter` e `isHidden`.

### 3. Comportamento esperado
- Sem busca: paginação cursor de 50 igual hoje.
- Com busca: nova RPC com `p_search`, reseta cursor, `loadMore` continua funcionando dentro do conjunto filtrado.
- Busca "Fineias" retorna `276726e0-…` mesmo estando na posição 96.
- Busca por telefone (com ou sem máscara) também funciona via `phone_normalized` (dígitos).

### 4. Inbox (`/inbox`)
Auditoria rápida depois: `InboxThreadList` também filtra client-side sobre lista carregada via `fetchInboxScopedThreads`. Mesma classe de bug, será tratado em PR separado após validação do /messages.

Pode aprovar para eu aplicar as duas edições de frontend.
