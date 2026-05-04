## Problema

O dropdown de filtro de prioridade na tela `/tasks` mostra as chaves cruas (`tasks.highPriority`, `tasks.mediumPriority`, `tasks.lowPriority`) em vez dos labels traduzidos. As chaves são usadas em `TasksList.tsx` mas nunca foram registradas em `src/lib/i18n.ts`.

## Mudança

Adicionar 3 chaves nos dois dicionários (PT e EN) de `src/lib/i18n.ts`, logo abaixo de `tasks.allPriorities`:

**PT (após linha 220):**
- `tasks.highPriority`: "Alta prioridade"
- `tasks.mediumPriority`: "Média prioridade"
- `tasks.lowPriority`: "Baixa prioridade"

**EN (após linha 671):**
- `tasks.highPriority`: "High priority"
- `tasks.mediumPriority`: "Medium priority"
- `tasks.lowPriority`: "Low priority"

Nenhuma outra mudança necessária — `TasksList.tsx` já consome as chaves corretamente.