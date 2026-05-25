## Fix: tags estourando o card do Kanban

Tags com texto longo sem espaços (`Problema:bagagem_extraviada/danificada`) usam `inline-flex` sem regra de quebra e estouram a largura do card.

**Mudanças (apenas CSS):**

1. `src/components/opportunities/OpportunityCard.tsx`
   - Adicionar `max-w-full break-all whitespace-normal text-left` no `<span>` de cada tag e no `+N`.

2. `src/components/opportunities/SeialzOpportunityCard.tsx`
   - Mesma correção nos `<span>` de tag e `+N`.

Sem mudança de lógica, schema, tokens ou backend.