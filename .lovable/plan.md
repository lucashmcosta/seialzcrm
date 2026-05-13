## Remover ícone de lixeira do card de oportunidade

**Arquivo:** `src/components/opportunities/SeialzOpportunityCard.tsx`

1. Remover o botão com `<TrashSimple />` (linha ~85) do card.
2. Remover `TrashSimple` do import do `@phosphor-icons/react` (linha 1).
3. Manter o ícone de edição (PencilSimple). A exclusão continuará possível pela tela de detalhes da oportunidade.