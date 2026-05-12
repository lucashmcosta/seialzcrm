## Multi-select para filtros de Oportunidades

Tornar os filtros **Responsável**, **Etapa** e **Etiqueta** do Popover de Filtros Avançados em **multi-select** — usuário poderá escolher vários valores simultaneamente.

### Arquivo
- `src/pages/opportunities/OpportunitiesKanban.tsx`

### Abordagem de UI
Em vez de adicionar uma biblioteca, reaproveitar o padrão já existente no projeto: um botão "Trigger" que abre um sub-Popover contendo lista de `<Checkbox>` (uma por opção) com busca opcional. Visual coerente com o resto do CRM (Seialz v1).

Cada filtro vira um botão com:
- Texto "Todos" se nenhum selecionado
- "Nome único" se 1 selecionado
- "N selecionados" se 2+
- Contador de selecionados ao lado

### Mudanças de estado

```ts
// antes
const [filterOwner, setFilterOwner] = useState<string>('all');
const [filterStage, setFilterStage] = useState<string>('all');
const [filterTag, setFilterTag] = useState<string>('all');

// depois
const [filterOwners, setFilterOwners] = useState<string[]>([]); // [] = todos. 'none' = sem responsável
const [filterStages, setFilterStages] = useState<string[]>([]);
const [filterTags, setFilterTags] = useState<string[]>([]);
```

### Lógica de filtragem (substitui as duas ocorrências)

```ts
const matchesOwner =
  filterOwners.length === 0 ||
  filterOwners.includes(opp.owner_user_id ?? 'none');

const matchesStage =
  filterStages.length === 0 || filterStages.includes(opp.pipeline_stage_id);

const oppTagIds = (tagsByOpportunity[opp.id] || []).map(t => t.id);
const matchesTag =
  filterTags.length === 0 || filterTags.some(t => oppTagIds.includes(t));
```

### Demais ajustes
- `clearFilters`: setar os 3 arrays para `[]`.
- `activeFiltersCount`: usar `filterOwners.length > 0`, `filterStages.length > 0`, `filterTags.length > 0`.
- `useMemo` deps: trocar referências para os novos arrays.
- Remover SavedViews dependências dessas chaves (se houver) ou mapear o array como antes (verificar; manter compatível).

### UI dos 3 filtros (dentro do PopoverContent)

Componente inline reutilizável `MultiSelectFilter`:
- Trigger: `<Button variant="outline" className="w-full justify-between">{label}</Button>`
- Popover lateral com `Command` (já existe em `components/ui/command.tsx`) ou simples lista de Checkbox.

Para simplicidade e zero novas dependências: lista vertical de `<Checkbox>` com label, dentro de um `<div className="max-h-48 overflow-auto">` no PopoverContent secundário.

### Não muda
- Schema do banco, RLS, queries.
- Filtros de Valor, Data de Fechamento, Data de Criação.
- Página de Contatos (somente Oportunidades, conforme escopo do pedido — Contatos não tem Etiqueta e usa lifecycle como categoria).
- Componente mobile.

### Pergunta
Confirma que é **só** na tela de Oportunidades? Em Contatos os campos equivalentes seriam Responsável e Etapa (ciclo de vida) — se desejar, faço também.
