## Corrigir checkbox da tabela que não seleciona

**Problema:** Na lista de contatos, clicar no checkbox da linha não seleciona — em vez disso, navega para o detalhe do contato. A `TableRow` (react-aria-components) tem `onAction={() => navigate(...)}`, então o clique no checkbox borbulha até a linha e dispara a navegação antes que o estado do checkbox seja atualizado.

### Mudanças

**Arquivo:** `src/components/application/table/table.tsx`

1. Em `TableCheckboxCell`: envolver o `<Checkbox>` em um `<div>` com `onPointerDown`, `onPointerUp` e `onClick` chamando `e.stopPropagation()`, para impedir que o clique acione `onAction` da linha (navegação). Manter o `Cell` como container.
2. Em `TableCheckboxHeader`: aplicar o mesmo wrapper por consistência (evita acionar sort/header behavior).
3. Manter o componente `Checkbox` (Radix) como está — o problema é apenas a propagação do evento até a `Row` do react-aria.

### Resultado esperado

- Clicar no checkbox da linha apenas marca/desmarca, sem navegar.
- Clicar em qualquer outra parte da linha continua navegando para o detalhe.
- Checkbox do header (selecionar todos) funciona normalmente.