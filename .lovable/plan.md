## Mover "Editar" para o menu de 3 pontinhos

**Arquivo:** `src/pages/opportunities/OpportunityDetail.tsx`

1. Remover o botão verde "Editar" da linha superior (fora do card). A linha superior fica só com o "Voltar" à esquerda.
2. Dentro do menu de 3 pontinhos do card, adicionar como primeiro item:
   - "Editar" (ícone `PencilSimple`) que chama `setEditDialogOpen(true)`, condicional a `permissions.canEditOpportunities`.
   - Separador antes de "Marcar como Ganho/Perdido" (quando ambos visíveis).
3. Ajustar a condição de exibição do dropdown para aparecer também quando só houver permissão de editar (não apenas quando `status === 'open'`).