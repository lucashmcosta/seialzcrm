## Ajustes no Kanban de Oportunidades

Apenas mudanças de UI/CSS, sem alterar lógica.

### 1. Colunas mais finas

Em `src/pages/opportunities/OpportunitiesKanban.tsx` (linhas 794 e 990), trocar a largura das colunas:

- De: `w-[272px]`
- Para: `w-[232px]`

Isso reduz ~40px por coluna, permitindo ver mais colunas simultaneamente sem prejudicar a legibilidade dos cards.

### 2. Título do card limitado a 2 linhas com tooltip

Em `src/components/opportunities/SeialzOpportunityCard.tsx` (linha 71):

- Adicionar `line-clamp-2` no `<h4>` para limitar a 2 linhas com reticências automáticas (Tailwind já oferece essa classe).
- Adicionar atributo `title={title}` no `<h4>` para tooltip nativo do navegador com o texto completo no hover.

Resultado: títulos longos como "Mário Do Nascimento Felix Nascimento Felix — CT FORM REVISAO CALCULO v1" são truncados em 2 linhas, e o texto completo aparece ao passar o mouse.

### Notas

- Mantém todos os tokens semânticos do design system Seialz.
- Não toca no card mobile (`MobileOpportunitiesKanban.tsx`), apenas no desktop.
- Sem mudanças de espaçamento interno do card — o ganho de espaço vem da redução da coluna.
