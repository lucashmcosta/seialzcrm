## Bug

No `OpportunitiesKanban.tsx`, ao alterar qualquer filtro (Responsável, Etapa, Tag, etc.), o efeito da linha 168 dispara `fetchData()`, que chama `setLoading(true)` (linha 240). O early-return da linha 800 (`if (loading) { return <Skeleton/> }`) então desmonta toda a página — incluindo o `<Dialog>` de Filtros — e ao terminar o fetch a página remonta e o modal reabre. É exatamente o "pisca e volta" que você vê.

A mesma coisa acontece nas datas/valores (mas o debounce de 200ms disfarça um pouco).

## Correção

Separar **carregamento inicial** de **refetch**:

1. Adicionar `const [initialLoading, setInitialLoading] = useState(true)`.
2. Em `fetchData()`:
   - Continuar usando `setLoading(true)` (para o `onRefresh` e indicadores inline existentes).
   - No `finally`/após o fetch, fazer `setInitialLoading(false)`.
3. Trocar o early-return da linha 767 (mobile) e da linha 800 (desktop) de `if (loading)` para `if (initialLoading)`.

Resultado: o skeleton aparece só na primeira carga da página. Mudanças de filtro continuam refazendo o fetch normalmente, mas o `<Dialog>` permanece montado — nada de fechar/reabrir.

## Fora de escopo

- Não mexo na lógica de filtros, RPC, debounce nem na UI do `MultiSelectFilter`.
- Não toco no mobile além de trocar a condição do early-return pelo mesmo `initialLoading`.
- Não mexo em outras páginas.
