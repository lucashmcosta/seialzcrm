## Problema

Na página de Contatos, ao clicar nos checkboxes (bolinhas) das linhas ou no checkbox do cabeçalho, a navegação para `ContactDetail` é disparada, porque o clique propaga para o `TableRow` que tem `onAction` configurado para navegar.

A lógica de seleção múltipla e "selecionar todos" já existe no código (`handleSelectAll`, `handleSelectOne`, `BulkActionsBar`), mas é inutilizada por esse bug de propagação de clique.

## Solução

Ajustar o componente `src/components/application/table/table.tsx` para que `TableCheckboxCell` e `TableCheckboxHeader` parem a propagação do clique e do pointer-down, evitando o disparo do `onAction` da linha.

Mudanças:

1. Em `TableCheckboxCell`: envolver o `Checkbox` em um `<div>` com `onClick={e => e.stopPropagation()}` e `onPointerDown={e => e.stopPropagation()}`.
2. Em `TableCheckboxHeader`: mesmo tratamento (boa prática, e mantém consistência).
3. Nenhuma alteração de lógica de negócio, hooks ou rotas — apenas frontend/apresentação.

Resultado:
- Clicar no checkbox da linha apenas marca/desmarca aquele contato (mostra a `BulkActionsBar`).
- Clicar no checkbox do cabeçalho marca/desmarca todos da página atual (com opção "Selecionar todos os N contatos" já existente).
- Clicar em qualquer outro lugar da linha continua navegando para `ContactDetail` como antes.

## Arquivos afetados

- `src/components/application/table/table.tsx` (única edição)
