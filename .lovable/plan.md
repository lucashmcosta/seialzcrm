## Padronizar Filtros da Tela de Contatos

Replicar o padrão usado em **Oportunidades**: substituir os filtros soltos (responsável, etapa, datas) por um único botão **"Filtros"** com Popover, badge contador, e botão **"Limpar"**.

### Arquivo
- `src/pages/contacts/ContactsList.tsx`

### O que permanece inline (na barra superior)
- Campo de **Pesquisa** (full width / flex-1)
- Botão **Filtros** (com badge `activeFiltersCount`)
- **ColumnSelector** (Colunas)

### O que vai para dentro do Popover "Filtros Avançados"
- **Responsável** (apenas se `permissions.viewAllContacts`) — Select
- **Etapa do ciclo de vida** — Select (Lead, Qualificado, Cliente, Inativo, etc.)
- **Data de Criação** — dois inputs `dd/mm/aaaa` (de / até)

### Implementação
1. **Imports novos**: `Popover, PopoverTrigger, PopoverContent`, `Badge`, `FunnelSimple` (phosphor).
2. **Estado novo**: `const [showFilters, setShowFilters] = useState(false);`
3. **`activeFiltersCount`**: contar `ownerFilter !== 'all'`, `stageFilter !== 'all'`, `createdFromFilter`, `createdToFilter`.
4. **`clearFilters()`**: resetar os 4 filtros para os valores padrão.
5. **UI**: substituir o bloco atual de filtros (linhas ~363-420) por:
   - `<div className="mb-6 flex flex-wrap gap-3 items-center">` contendo:
     - Input de busca (flex-1)
     - `<Popover>` com `<Button variant="outline">` (ícone + "Filtros" + badge)
     - `<ColumnSelector>` no fim
   - PopoverContent (`w-80`, `align="end"`) replicando o layout de Oportunidades: header "Filtros Avançados" + "Limpar", e as 3 seções acima.

### Não muda
- Lógica de query Supabase (já lê os mesmos estados).
- Componente mobile (`MobileContactsList`) — já tem chips/busca próprios, fora do escopo.
- Demais páginas.
