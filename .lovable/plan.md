## Problema

Quando o usuário clica na bolinha do cabeçalho (selecionar todos), `allSelected` vira `true` e o React renderiza um `<div>` (banner "Todos os X contatos selecionados") como filho direto do componente `<Table>` do react-aria-components. O `AriaTable` só aceita `TableHeader` e `TableBody` como filhos — ao tentar reconciliar esse `<div>` dentro da coleção virtual, o React chama `createTextNode` em um container falso e quebra com:

`TypeError: getOwnerDocumentFromRootContainer(...).createTextNode is not a function`

## Correção

Em `src/pages/contacts/ContactsList.tsx`:

1. Mover o bloco do banner (`{allSelected && totalCount > sortedContacts.length && (...)}` linhas 540–564) para FORA do `<Table>`, posicionando-o logo acima do `<Table>` (ainda dentro do `TableCard`/wrapper). 
2. Manter exatamente a mesma lógica de visibilidade e estilos (apenas mudando o local de renderização).
3. Verificar no preview que: clicar no checkbox do header não dispara erro, o banner aparece corretamente acima da tabela quando todos da página estão selecionados, e a seleção continua refletindo nas bolinhas verdes.

Nenhum outro arquivo precisa ser alterado.
