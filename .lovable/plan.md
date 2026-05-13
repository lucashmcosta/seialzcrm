## Remover lixeira do OpportunityCard (variante restante)

O card visível no kanban também usa `src/components/opportunities/OpportunityCard.tsx`, que ainda tem o botão de lixeira.

**Arquivo:** `src/components/opportunities/OpportunityCard.tsx`
1. Remover o botão `<TrashSimple />` (linha ~63) e seu wrapper.
2. Remover `TrashSimple` do import (linha 3).