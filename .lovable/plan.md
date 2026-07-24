## Diagnóstico

O erro `Invariant failed` sobe do `@hello-pangea/dnd` (arquivo `OpportunitiesKanban-*.js` no stack + `flushSync` no meio, típico de drop). Nesta biblioteca essa invariante estoura de forma determinística quando o React renderiza **dois `<Draggable>` com o mesmo `draggableId`** dentro do mesmo `DragDropContext`.

Em `src/pages/opportunities/OpportunitiesKanban.tsx` há três caminhos que podem introduzir `opp.id` duplicado na hora de renderizar Draggables:

1. **`loadMoreForStage` (linha 445‑481)** usa `range(currentOpps.length, currentOpps.length + CARDS_PER_STAGE - 1)` ordenado por `created_at desc`. Se qualquer card foi movido para fora do stage entre o fetch inicial e o "load more" (drag do usuário, move otimista, backfill, outra aba etc.), `currentOpps.length` diminui e a nova página pode re‑trazer uma linha já presente. O `setOpportunitiesByStage` faz `[...currentOpps, ...data]` sem deduplicar → dois cards com o mesmo id na mesma coluna → invariant no próximo drop.
2. **`persistMove` (linha 518‑525)** faz `[...(prev[newStageId] || []), updatedOpp]`. Se um refetch ou realtime chegou primeiro e já colocou o card no destino, temos duplicata.
3. **RPC/fallback de fetch inicial (linha 322/373)** confia na consistência do backend. Se um card estiver com `pipeline_stage_id` transitório (drag concorrente em outra sessão, trigger), pode aparecer em duas listas.

O search também expõe o mesmo caso: `searchResults.filter(...)` pode ter, em teoria, o mesmo id se dois efeitos anexarem resultados (não é o caminho principal, mas cobrimos por segurança).

## Correção

Deduplicar `opp.id` no exato ponto em que renderizamos Draggables e ao mesclar páginas. Sem mudar UX, ordenação, filtros ou fluxo de drag.

### Alterações em `src/pages/opportunities/OpportunitiesKanban.tsx`

1. **`getOpportunitiesForStage`** (usado nos dois modos de layout, linhas 417 e 1026/1377): antes do `return`, aplicar dedupe por `opp.id` mantendo a primeira ocorrência (`Map` por id). Isso garante que qualquer lista que alimente `<Draggable>` seja única por render, blindando os dois `DragDropContext` da árvore.
2. **`loadMoreForStage`** (linha 468‑471): ao mesclar `[...currentOpps, ...data]`, deduplicar por id antes de salvar em `opportunitiesByStage[stageId]`. Mesma dedupe no `setOpportunities(prev => [...prev, ...data])` (usa `Set` de ids já presentes).
3. **`persistMove`** (linha 518‑525): no update do destino, filtrar `prev[newStageId]` removendo qualquer entrada com o mesmo id antes de acrescentar `updatedOpp` (idempotente contra realtime/refetch concorrente).

Cada mudança é local, sem novos hooks, sem alterar props do `Draggable`/`Droppable`.

## Fora de escopo

- Não trocar biblioteca DnD.
- Não mexer no `MobileOpportunitiesKanban`.
- Sem migrations, sem alterações de RPC/backend.
- Sem instrumentação nova de Sentry — a causa raiz é resolvida no render.

## Verificação

1. Build passa.
2. Abrir `/opportunities` (kanban), com colunas cheias, rolar para carregar `load more`, arrastar um card entre colunas várias vezes seguidas — sem tela branca / sem `Invariant failed` no console.
3. Confirmar contadores por stage seguem corretos após múltiplos moves (`stageCounts` inalterado pela mudança).
4. Verificar no console (dev) que a lista renderizada de uma coluna após load-more não tem ids repetidos (`new Set(list.map(o=>o.id)).size === list.length`).