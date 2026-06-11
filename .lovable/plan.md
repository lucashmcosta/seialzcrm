## Objetivo

Adicionar, no modo de seleção do Kanban de Oportunidades, um atalho para selecionar (e desmarcar) todos os cards de uma coluna de uma vez.

## Comportamento

- Quando o modo de seleção estiver ativo, cada cabeçalho de coluna ganha um pequeno controle ao lado do contador:
  - Se nenhum (ou parte) dos cards da coluna estiver selecionado → mostra "Selecionar todos".
  - Se todos os cards visíveis da coluna já estiverem selecionados → mostra "Limpar".
- Clicar adiciona/remove em lote os IDs daquela coluna do `selectedIds`.
- "Todos" considera apenas os cards atualmente carregados na coluna (respeitando o infinite scroll e os filtros/busca já aplicados). Não força carregar o restante.
- O `BulkActionsBar` continua reagindo normalmente à mudança de `selectedIds`.

## Mudanças técnicas

`src/pages/opportunities/OpportunitiesKanban.tsx`:
- Criar helpers `selectAllInColumn(stageId)` e `clearColumn(stageId)` que operam sobre os cards já renderizados daquela etapa.
- No header de cada coluna (tanto tema Default quanto Seialz), renderizar condicionalmente (`kanbanSelectionMode`) um botão de texto pequeno (`text-xs text-muted-foreground hover:text-foreground`) com o label dinâmico baseado no estado de seleção da coluna.
- Sem alterações em `BulkActionsBar`, cards ou backend.

## Fora de escopo

- Selecionar todos do board inteiro.
- Selecionar cards ainda não carregados pelo infinite scroll.
- Mudanças em mobile/list view.
