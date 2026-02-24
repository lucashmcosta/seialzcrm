
# Corrigir Kanban (status Ganho/Perdido) e Pesquisa por Nome do Cliente

## Problema 1: Kanban nao mostra oportunidades ganhas/perdidas

**Causa raiz:** Na busca de oportunidades por estagio (linha 174), o filtro `.eq('status', 'open')` e aplicado a TODAS as colunas, incluindo as de tipo "won" e "lost". Quando uma oportunidade e marcada como ganha, seu status muda para "won", mas o Kanban so busca "open" - entao ela desaparece.

**Solucao:** Ajustar o filtro de status de acordo com o tipo do estagio:
- Estagios tipo `won` -> buscar `status = 'won'`
- Estagios tipo `lost` -> buscar `status = 'lost'`
- Estagios normais -> buscar `status = 'open'`

Isso se aplica em 3 pontos:
1. Busca inicial por estagio (fetchData, ~linha 160-181)
2. Busca de paginacao/infinite scroll (loadMoreForStage, ~linha 248-264)
3. Contagem do RPC ja deve estar correta pois usa stage_id sem filtro de status

## Problema 2: Pesquisa por nome do cliente nao funciona

**Causa raiz:** A pesquisa e feita apenas client-side sobre os dados ja carregados em memoria (max 50 por estagio). Se a oportunidade nao esta na primeira pagina, nao sera encontrada. Alem disso, na view de tabela, os dados sao os mesmos do Kanban (limitados).

**Solucao:** Quando o usuario digitar um termo de pesquisa, fazer uma busca no banco de dados usando `ilike` no titulo da oportunidade e um join com contatos. Isso garante que a pesquisa cubra todas as oportunidades, nao apenas as carregadas.

Adicionar um `useEffect` com debounce que, ao detectar `searchTerm`, faz uma query no Supabase filtrando por titulo ou nome do contato, e atualiza os resultados exibidos.

---

## Mudancas Tecnicas

### Arquivo: `src/pages/opportunities/OpportunitiesKanban.tsx`

**Mudanca 1 - Filtro de status por tipo de estagio:**

Na funcao `fetchData`, dentro do `Promise.all` que busca oportunidades por estagio, substituir o filtro fixo `.eq('status', 'open')` por um filtro dinamico:

```typescript
// Determinar o status correto baseado no tipo do estagio
const statusFilter = stage.type === 'won' ? 'won' : stage.type === 'lost' ? 'lost' : 'open';

const { data } = await supabase
  .from('opportunities')
  .select(`...`)
  .eq('organization_id', organization.id)
  .eq('pipeline_stage_id', stage.id)
  .eq('status', statusFilter)  // <-- filtro dinamico
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .limit(CARDS_PER_STAGE);
```

Aplicar a mesma logica na funcao `loadMoreForStage`:

```typescript
// Encontrar o tipo do estagio para determinar o filtro de status
const stageType = stages.find(s => s.id === stageId)?.type;
const statusFilter = stageType === 'won' ? 'won' : stageType === 'lost' ? 'lost' : 'open';

const { data } = await supabase
  .from('opportunities')
  .select(`...`)
  .eq('organization_id', organization.id)
  .eq('pipeline_stage_id', stageId)
  .eq('status', statusFilter)  // <-- filtro dinamico
  .is('deleted_at', null)
  ...
```

**Mudanca 2 - Pesquisa server-side por nome do cliente:**

Adicionar uma funcao de pesquisa que consulta o banco quando o usuario digita:

```typescript
// Novo estado para resultados de pesquisa
const [searchResults, setSearchResults] = useState<Opportunity[] | null>(null);

// useEffect com debounce para pesquisa server-side
useEffect(() => {
  if (!searchTerm || searchTerm.length < 2 || !organization?.id) {
    setSearchResults(null);
    return;
  }

  const timer = setTimeout(async () => {
    const { data } = await supabase
      .from('opportunities')
      .select(`*, contacts(full_name), users(full_name)`)
      .eq('organization_id', organization.id)
      .is('deleted_at', null)
      .or(`title.ilike.%${searchTerm}%,contacts.full_name.ilike.%${searchTerm}%`)
      .limit(100);

    setSearchResults(data || []);
  }, 300);

  return () => clearTimeout(timer);
}, [searchTerm, organization?.id]);
```

Usar `searchResults` quando disponivel (pesquisa ativa) em vez dos dados do kanban, tanto no filtro `getOpportunitiesForStage` quanto no `filteredOpportunities` da tabela.

Na view Kanban, quando ha pesquisa ativa, os cards filtrados usarao os resultados do servidor. Na view tabela, `filteredOpportunities` usara `searchResults` quando disponivel:

```typescript
const filteredOpportunities = useMemo(() => {
  const baseData = searchResults !== null ? searchResults : opportunities;
  return baseData.filter((opp) => {
    // manter filtros de owner, amount, date
    // remover filtro de searchTerm pois ja veio filtrado do servidor
    ...
  });
}, [opportunities, searchResults, ...]);
```

### Resumo das mudancas

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/opportunities/OpportunitiesKanban.tsx` | Filtro de status dinamico por tipo de estagio (won/lost/open) |
| `src/pages/opportunities/OpportunitiesKanban.tsx` | Pesquisa server-side com debounce para buscar por titulo e nome do contato |
