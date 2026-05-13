## Reduzir padding nos cards e colunas do kanban

### 1. `src/components/opportunities/OpportunityCard.tsx`
- `<Card className="p-4 ...">` → `p-3`
- `<div className="space-y-3">` → `space-y-2`

### 2. `src/pages/opportunities/OpportunitiesKanban.tsx` (kanban legado, linhas 1271–1310)
- Container das colunas: `flex gap-4 overflow-x-auto pb-4` → `flex gap-3 overflow-x-auto pb-4`
- `<CardHeader className="pb-3">` → `<CardHeader className="px-3 pt-3 pb-2">`
- `<CardContent className="space-y-3 ...">` → `<CardContent className="px-3 pb-3 space-y-2 ...">`

Sem mexer em lógica, só CSS. Mantém tokens semânticos.
