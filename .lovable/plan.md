## Problema

Na tela **Mensagens**, o filtro de aba (Minhas / Não atribuídas / Todas abertas / Resolvidas) já está usando `usePersistedFilters('messages.filter', 'all_open')`, mas existe um `useEffect` (linhas 525–534 de `src/pages/messages/MessagesList.tsx`) que **sobrescreve** o filtro toda vez que `threads` carrega:

```ts
if (hasMine) setFilter('mine');
else setFilter('unassigned');
```

Como isso roda sempre que `threads.length` ou `userProfile.id` mudam (inclusive ao reentrar na tela), o valor persistido é descartado.

## Mudança

Fazer esse "smart default" rodar **apenas na primeira vez** (quando o usuário ainda não escolheu nada). Estratégia:

1. Em `src/pages/messages/MessagesList.tsx`, trocar a inicialização de `filter` para usar um sentinel:
   ```ts
   const [filter, setFilter, , filterHydrated] =
     usePersistedFilters<ThreadFilter | null>('messages.filter', null);
   ```
2. Adicionar um `useRef(false)` `appliedSmartDefaultRef`. No `useEffect` das linhas 525–534:
   - Só aplica o smart default se `filterHydrated && filter === null && !appliedSmartDefaultRef.current`.
   - Marca o ref como `true` depois de setar.
   - Resultado: se o usuário já escolheu (valor persistido != null), o effect não toca.
3. Em todos os lugares que leem `filter` (switch de status na linha ~1119, `filterOptions`, render dos chips), tratar `null` como `'all_open'` via:
   ```ts
   const effectiveFilter: ThreadFilter = filter ?? 'all_open';
   ```
   E usar `effectiveFilter` nesses pontos. O `setFilter` continua recebendo `ThreadFilter` normal nos cliques dos chips.
4. Manter o effect de "Force mine for users without view-all" (linha 1170) usando `effectiveFilter`.

## Fora de escopo

- Não mexer em busca, threads, realtime ou qualquer outra lógica.
- Não alterar UI/visual.
- Mobile (`MobileMessagesList`) não está nesse fluxo — não tocar a menos que apareça o mesmo bug.
