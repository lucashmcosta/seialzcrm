## Filtro: Data de Criação em Oportunidades e Contatos

Adicionar novo filtro de intervalo por **Data de Criação** (`created_at`) nas telas de Oportunidades (Kanban/Tabela) e Contatos.

---

### 1) `src/pages/opportunities/OpportunitiesKanban.tsx`

No painel de **Filtros Avançados** (Sheet), logo abaixo da seção "Data de Fechamento", adicionar uma nova seção **"Data de Criação"** com dois inputs `dd/mm/aaaa` (de / até).

- **Estado novo**:
  ```ts
  const [filterCreatedFrom, setFilterCreatedFrom] = useState<string>('');
  const [filterCreatedTo, setFilterCreatedTo] = useState<string>('');
  ```
- **Garantir** que `created_at` está sendo selecionado na query de oportunidades (verificar `select(...)`; incluir caso esteja faltando) e adicionar `created_at` na interface/tipo `Opportunity`.
- **Lógica de filtro** (duas ocorrências, ~linhas 377 e ~617): adicionar:
  ```ts
  const oppCreatedDate = opp.created_at ? opp.created_at.slice(0, 10) : '';
  const matchesCreatedFrom = !filterCreatedFrom || oppCreatedDate >= filterCreatedFrom;
  const matchesCreatedTo   = !filterCreatedTo   || oppCreatedDate <= filterCreatedTo;
  ```
  Incluir ambos no `&&` final do filtro.
- **`useMemo` deps** (linha 625): adicionar `filterCreatedFrom`, `filterCreatedTo`.
- **`clearFilters`**: resetar ambos para `''`.
- **`activeFiltersCount`** (~linhas 594-600): incluir `filterCreatedFrom` e `filterCreatedTo`.
- **UI**: novo bloco igual ao de "Data de Fechamento", sem o checkbox "sem data" (toda oportunidade tem `created_at`).

---

### 2) `src/pages/contacts/ContactsList.tsx`

A tela de Contatos hoje só tem filtros inline (busca, responsável, etapa, colunas). Adicionar dois inputs `<Input type="date">` inline com label discreto **"Criado de / até"**.

- **Estado novo**:
  ```ts
  const [createdFromFilter, setCreatedFromFilter] = useState<string>('');
  const [createdToFilter, setCreatedToFilter]   = useState<string>('');
  ```
- **Query** em `fetchContacts` (~linha 195): aplicar via Supabase:
  ```ts
  if (createdFromFilter) query = query.gte('created_at', createdFromFilter);
  if (createdToFilter)   query = query.lte('created_at', createdToFilter + 'T23:59:59.999Z');
  ```
- **`useEffect` que dispara `fetchContacts`**: incluir os dois novos estados nas dependências (e no reset de paginação mobile).
- **UI**: dentro do `<div className="mb-6 flex flex-wrap gap-3">` (linha 364), após o select de etapa, renderizar:
  ```tsx
  <div className="flex items-center gap-2">
    <Input type="date" value={createdFromFilter} onChange={e => setCreatedFromFilter(e.target.value)} className="w-[150px]" />
    <span className="text-sm text-muted-foreground">até</span>
    <Input type="date" value={createdToFilter} onChange={e => setCreatedToFilter(e.target.value)} className="w-[150px]" />
  </div>
  ```

---

### Não muda

- Schema do banco, RLS, edge functions e relatórios.
- Componentes mobile (Kanban/Contacts mobile) — fora do escopo desta solicitação. Posso estender depois se desejado.
- Demais filtros existentes permanecem intactos.
