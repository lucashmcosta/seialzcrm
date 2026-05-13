# Modal de filtros centralizado em Contatos

Aplicar o mesmo padrão usado em Oportunidades em `src/pages/contacts/ContactsList.tsx`.

## Mudanças

1. Substituir `import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'` por `import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'`. Remover import do popover se não for usado em outro lugar do arquivo.
2. Trocar o bloco `Popover` (linhas 401–478) por um `Dialog` controlado por `showFilters`/`setShowFilters`:
   - `DialogTrigger asChild` envolve o mesmo botão "Filtros" com badge.
   - `DialogContent size="md" className="p-0 max-h-[85vh] flex flex-col gap-0"`:
     - Header `px-6 py-4 border-b` com `DialogTitle` "Filtros".
     - Corpo rolável `flex-1 overflow-y-auto px-6 py-5 space-y-5` mantendo os mesmos campos: Responsável (se `viewAllContacts`), Estágio, Data de Criação.
     - Footer `px-6 py-3 border-t flex items-center justify-between`: "Limpar" (ghost, desabilitado quando `activeFiltersCount === 0`) e "Aplicar" (primary, fecha o modal).
3. Não alterar nenhum estado, `clearFilters`, lógica de filtros ou colunas.

## Resultado

Filtros de Contatos abrem como modal centralizado com overlay escuro, igual ao de Oportunidades.
