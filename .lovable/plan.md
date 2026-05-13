# Corrigir modal de Filtros das Oportunidades

## Problema

Hoje o painel de filtros é um `Popover` ancorado no botão "Filtros". Como o conteúdo é alto (Responsável, Etapa, Valor, Datas, Etiqueta), ele:
- Vaza por cima das colunas do Kanban (parece "fora do modal").
- Não tem overlay escurecendo o fundo.
- Em telas menores fica desalinhado e cortado.

## Solução

Trocar o `Popover` por um `Sheet` lateral (drawer à direita) do design system, que já vem com overlay escuro, animação e foco bloqueado — comportamento profissional e consistente com o resto do app.

### Mudanças (apenas UI, sem alterar lógica de filtros)

Arquivo: `src/pages/opportunities/OpportunitiesKanban.tsx`

1. Remover imports de `Popover/PopoverTrigger/PopoverContent` deste bloco e adicionar `Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetFooter` de `@/components/ui/sheet`.
2. Substituir o `filterPanel` (linhas ~826–965):
   - `Sheet` controlado por `showFilters` / `setShowFilters`.
   - `SheetTrigger asChild` envolve o mesmo `Button` atual (mantém badge de contagem).
   - `SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col"`:
     - `SheetHeader` fixo no topo com `SheetTitle` "Filtros" + botão "Limpar" (quando `activeFiltersCount > 0`), com `border-b` e padding `px-6 py-4`.
     - Corpo rolável: `<div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">` contendo exatamente os mesmos blocos (Responsável, Etapa, Valor, Data de Fechamento + checkbox, Data de Criação, Etiqueta) — sem alterar nenhum estado, prop ou condicional.
     - `SheetFooter` fixo no rodapé com `border-t px-6 py-3`, contendo dois botões: "Limpar" (ghost, desabilitado se sem filtros) e "Aplicar" (primary, fecha o sheet via `setShowFilters(false)`).
3. Garantir que cada campo ocupe largura total (`w-full`) dentro do sheet — os `Input` de data/valor já são responsivos, só vão respirar melhor com a largura maior.
4. Não alterar o `MultiSelectFilter`, nem a lógica de `clearFilters`, nem o estado dos filtros.

### Resultado visual

- Clicar em "Filtros" abre um painel lateral à direita, com overlay escuro sobre o Kanban.
- Header fixo com título e ações; corpo com scroll quando necessário; footer fixo com Aplicar/Limpar.
- Nenhum elemento "vaza" sobre as colunas, e o foco fica preso no painel até fechar.

## Fora de escopo

- Não mexer em estilos de cards/colunas do Kanban.
- Não alterar comportamento dos filtros nem queries.
