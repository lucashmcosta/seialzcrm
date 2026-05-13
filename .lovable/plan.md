# Filtros como modal centralizado

Trocar o `Sheet` lateral por um `Dialog` centralizado em `src/pages/opportunities/OpportunitiesKanban.tsx`.

## Mudanças

1. Substituir imports de `@/components/ui/sheet` por `Dialog, DialogTrigger, DialogContent` de `@/components/ui/dialog`.
2. No `filterPanel`:
   - `Dialog` controlado por `showFilters` / `setShowFilters`.
   - `DialogTrigger asChild` envolve o mesmo botão "Filtros" atual (com badge).
   - `DialogContent size="md" className="p-0 max-h-[85vh] flex flex-col gap-0"`:
     - **Header** (`px-6 py-4 border-b`): título "Filtros" + (mantém o `X` nativo do DialogContent no canto).
     - **Corpo rolável** (`flex-1 overflow-y-auto px-6 py-5 space-y-5`): mesmos blocos atuais (Responsável, Etapa, Valor, Data de Fechamento + checkbox, Data de Criação, Etiqueta) — sem mudar lógica.
     - **Footer** (`px-6 py-3 border-t flex items-center justify-between`): botão "Limpar" (ghost, desabilitado quando `activeFiltersCount === 0`) e "Aplicar" (primary, fecha o modal).
3. Não alterar `MultiSelectFilter`, estado dos filtros nem `clearFilters`.

## Resultado

Modal centralizado com overlay escurecido (já vem do `DialogOverlay`), header/footer fixos e corpo rolável quando o conteúdo passa de 85vh.
