## Diagnóstico

O crash é do `react-aria-components` `ListBox` na lista de conversas de `/commercial` (`src/pages/messages/MessagesList.tsx`), disparado depois que o usuário clicou várias vezes em "Carregar mais" e trocou de filtro/endpoint.

Stack relevante (build): `CollectionRoot` → `useCachedChildren` → `Array.push` → `RangeError: Invalid array length`.

O `ListBox` recebe `visibleThreadsWithSelected`, que é derivado de:

1. `threads` do hook `useMessageThreads` (paginação por RPC + realtime),
2. filtros por status e por endpoint,
3. prepend condicional de `selectedThreadOverride`.

Nenhum desses passos deduplica por `thread.id`. O `ListBox` do react-aria monta um keymap linkado usando `id={value.id}`: quando dois itens têm o mesmo `id` (o que acontece quando a paginação/realtime traz uma thread já presente em uma página anterior, ou quando o override coincide com um item que passou a existir na lista após um refetch), o keymap corrompe e a rotina interna que aloca o array de filhos explode com "Invalid array length".

Isso é consistente com o rastro de rede no incidente: várias chamadas seguidas a `rpc_list_message_threads` (paginação) intercaladas com aberturas de thread antes do erro.

## Escopo da correção

Correção mínima, só em frontend/apresentação, sem tocar em hook, RPC ou schema.

1. Em `src/pages/messages/MessagesList.tsx`, deduplicar por `id` a lista final que entra no `ListBox` (`visibleThreadsWithSelected`), preservando a ordem da primeira ocorrência.
2. Manter `id={value.id}` no `ListBoxItem` (já está correto) e não mudar o contrato do `ChatListItem`.
3. Nada mais é alterado: filtros, paginação, realtime, override de seleção, badges, contadores continuam iguais.

## Validação

- Abrir `/commercial`, aplicar filtro por número, clicar em "Carregar mais" várias vezes, abrir uma thread já visível, alternar filtros e voltar. O `ListBox` não deve mais crashar.
- Conferir no console que não há warning de "duplicate key" para `ChatListItem` mesmo após múltiplas páginas.

## Não incluído

- Não vou investigar/ajustar o merge de páginas dentro de `useMessageThreads` nesta rodada (fica como follow-up se quisermos remover a causa raiz e não só o sintoma).
- Sem migração, sem mudança de UI, sem alteração de business logic.
