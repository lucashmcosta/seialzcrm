## Filtro: oportunidades sem Data de Fechamento

Adicionar uma opção no painel de **Filtros Avançados** do Kanban/Tabela de Oportunidades para listar apenas oportunidades com `close_date` vazio.

### Arquivo

- `src/pages/opportunities/OpportunitiesKanban.tsx`

### UX

- Logo abaixo dos dois inputs `dd/mm/aaaa` da seção **Data de Fechamento**, adicionar um `Checkbox` (shadcn) com o label **"Apenas sem data de fechamento"**.
- Quando ativo:
  - Os inputs de data inicial/final ficam desabilitados (e visualmente esmaecidos), pois são mutuamente exclusivos.
  - O filtro de listagem passa a exibir somente oportunidades com `close_date == null`.
- Quando inativo: comportamento atual (range opcional).
- O contador `activeFiltersCount` (badge no botão "Filtros") incrementa em +1 quando o checkbox estiver ativo.
- O botão **Limpar filtros** já existente reseta também esse novo filtro.

### Implementação

1. **Estado novo**: `const [filterNoCloseDate, setFilterNoCloseDate] = useState<boolean>(false);`
2. **Lógica de filtro** (duas ocorrências, linhas ~377 e ~611):
   - Substituir `matchesDateFrom`/`matchesDateTo` por:
     ```ts
     const matchesNoCloseDate = !filterNoCloseDate || opp.close_date == null;
     const matchesDateFrom = filterNoCloseDate || !filterDateFrom || (opp.close_date && opp.close_date >= filterDateFrom);
     const matchesDateTo   = filterNoCloseDate || !filterDateTo   || (opp.close_date && opp.close_date <= filterDateTo);
     ```
   - Incluir `matchesNoCloseDate` no `&&` final.
   - Adicionar `filterNoCloseDate` no array de dependências do `useMemo` (linha 619).
3. **`clearFilters`** (~linha 540): adicionar `setFilterNoCloseDate(false);`
4. **`activeFiltersCount`** (~linhas 549-557): adicionar `filterNoCloseDate` ao array `.filter(Boolean)`.
5. **UI** (após linha 899, dentro do bloco "Data de Fechamento"): renderizar o `<Checkbox>` controlado por `filterNoCloseDate`. Aplicar `disabled={filterNoCloseDate}` nos dois `<Input type="date">` acima.

### Não muda

- Schema do banco, RLS, edge functions e relatórios permanecem iguais.
- Demais filtros (responsável, etapa, valor, etiqueta) continuam intactos.