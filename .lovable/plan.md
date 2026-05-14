## Problema

O badge "Filtros 1" persiste corretamente (o `ownerFilter = Lucas Costa` foi restaurado), mas a lista mostra TODOS os contatos em vez de só o 1 do Lucas.

## Causa raiz: race condition entre hidratação e fetch

Quando a tela monta e a organização termina de carregar (`ready` passa a `true`), no MESMO commit:

1. `usePersistedFilters` (hidratação) chama `setOwnerFilter('lucas-id')` — mas `setState` só vale no próximo render.
2. O `useEffect` de `fetchContacts` também dispara (deps incluem `organization`), executando a query com `ownerFilter='all'` (valor atual do render). Resultado: busca TODOS os contatos.
3. Re-render com `ownerFilter='lucas-id'` → o `useEffect` de fetch refaz a query com o filtro correto.

Os dois fetches ficam em flight. Como nenhum tem cancelamento/sequência, o resultado do **primeiro** fetch (lista completa, mais dados, demora mais) chega depois do segundo e sobrescreve via `setContacts(...)`. UI fica com todos os contatos, badge mostra 1 — exatamente o que o usuário viu.

## Correção

Resolver o race no nível certo: garantir que o `fetchContacts` só rode depois que os filtros estiverem hidratados. Duas peças:

### 1. `usePersistedFilters` expõe estado de hidratação

Adicionar um terceiro retorno `hydrated: boolean` (ou retornar via tupla estendida) que vira `true` somente após o `setValue` da hidratação ter sido aplicado no render.

```ts
const [value, setValue, reset, hydrated] = usePersistedFilters(...)
```

Implementação: usar `useState<boolean>(!ready)` para `hydrated` e setar `true` no MESMO `setValue` da hidratação (ou no efeito após). Quando `ready=false` ainda, `hydrated=false`. Isso evita quebrar consumidores existentes — quem não usar o 4º item continua funcionando.

### 2. Páginas com fetch dependente esperam a hidratação

Em `ContactsList.tsx` (e demais telas que disparam fetch baseado em filtros persistidos), criar um único flag agregado:

```ts
const filtersHydrated = ownerHydrated && stageHydrated && createdFromHydrated && createdToHydrated;
useEffect(() => {
  if (!organization || !filtersHydrated) return;
  fetchContacts();
}, [organization, filtersHydrated, currentPage, itemsPerPage, debouncedSearch, ownerFilter, stageFilter, createdFromFilter, createdToFilter]);
```

Aplicar o mesmo padrão (`!filtersHydrated → return`) nas demais telas que carregam dados via filtros persistidos:

- `src/pages/opportunities/OpportunitiesKanban.tsx`
- `src/pages/tasks/TasksList.tsx`
- `src/pages/messages/MessagesList.tsx`
- `src/pages/reports/ReportsPage.tsx`
- `src/pages/marketing/*` (via `useMarketingPeriod` — exportar `hydrated` do hook também)

## Por que não resolver só com `await` ou debounce

- Debounce mascara o problema mas não elimina (em rede lenta, o "all" ainda pode ganhar).
- Cancelamento de request via `AbortController` funcionaria mas exige mexer em todos os fetches; o flag de hidratação é mais simples e cobre o caso real.

## Arquivos alterados

- `src/hooks/usePersistedFilters.ts` — retornar `hydrated` como 4º item da tupla.
- `src/pages/marketing/_hooks/useMarketingPeriod.ts` — propagar `hydrated`.
- `src/pages/contacts/ContactsList.tsx` — gate em `filtersHydrated` no `useEffect` de fetch.
- `src/pages/opportunities/OpportunitiesKanban.tsx` — idem.
- `src/pages/tasks/TasksList.tsx` — idem.
- `src/pages/messages/MessagesList.tsx` — idem.
- `src/pages/reports/ReportsPage.tsx` — idem.
- `src/pages/marketing/index.tsx`, `ads/index.tsx`, `funnel.tsx`, `timeline.tsx` — gate nos hooks de dados que dependem de período.

## Verificação

1. Aplicar filtro "Lucas Costa" em `/contacts`, sair, voltar → badge mostra 1 E a lista mostra apenas o cliente do Lucas (1 linha).
2. F5 com filtro aplicado → mesmo resultado, sem flash de "todos os contatos".
3. Abrir DevTools → Network: ao voltar para a tela, deve haver exatamente UMA request de contatos (não duas).
4. Repetir cenário em Oportunidades, Tarefas, Mensagens, Relatórios, Marketing.
