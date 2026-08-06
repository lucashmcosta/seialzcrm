# Corrigir erro "Cell count must match column count" na lista de Contatos

## O que acontece

Na tela de Contatos, ao marcar/desmarcar uma coluna no seletor "Colunas", a tabela quebra com tela de erro:
`Cell count must match column count. Found 7 cells and 6 columns.`

## Causa

O cabeçalho da tabela é renderizado direto a partir de `activeColumns`, então ele reage na hora à troca de colunas. As linhas, porém, são renderizadas pela coleção do `react-aria-components`, que só reconstrói as células quando algo listado em `dependencies` muda. Hoje o `TableBody` da lista de contatos declara apenas `dependencies={[selectedIds]}`, sem `activeColumns`. Resultado: o cabeçalho passa a ter 6 colunas enquanto as linhas em cache continuam com 7 células, e o react-aria lança o erro.

## Correção

Em `src/pages/contacts/ContactsList.tsx`:

- Incluir `activeColumns` (ou `visibleColumns`) nas `dependencies` do `TableBody` de dados: `dependencies={[selectedIds, activeColumns]}`.
- Fazer o mesmo no `TableBody` do estado de carregamento (skeleton), que hoje não declara `dependencies` e também monta células a partir de `activeColumns`.

Nada mais muda: sem alteração de banco, de RPC ou de lógica de negócio. As tabelas de Oportunidades não usam colunas dinâmicas, então não precisam de ajuste.

## Validação

Abrir `/contacts`, desmarcar e remarcar colunas no seletor "Colunas" (inclusive durante o carregamento) e confirmar que a tabela atualiza sem tela de erro e sem erro no console.
