## Objetivo
Restaurar o comportamento anterior da tela de detalhe da oportunidade no celular, sem redesenhar o mobile e sem alterar o desktop.

## Plano
1. Reintroduzir a detecção mobile em `src/pages/opportunities/OpportunityDetail.tsx` com `useIsMobile()` e `MobileLayout`, seguindo o mesmo padrão já usado em `ContactDetail` e `OpportunitiesKanban`.
2. Fazer o fluxo de renderização checar `isMobile` antes do layout desktop, inclusive nos estados de loading e empty, para impedir que o `<Layout>` desktop apareça comprimido no celular.
3. No branch mobile, manter uma estrutura simples e estável: botão de voltar, bloco principal da oportunidade, seletor de abas mobile e conteúdo das abas — sem reaproveitar a barra/header desktop que causou a quebra.
4. Preservar o branch desktop atual como está, para não mexer no layout que você aprovou no desktop.
5. Validar no viewport mobile da rota `/opportunities/:id` para confirmar que o sidebar desktop não aparece mais no celular.

## Detalhes técnicos
- Arquivo principal: `src/pages/opportunities/OpportunityDetail.tsx`
- Referências de padrão: `src/pages/contacts/ContactDetail.tsx` e `src/pages/opportunities/OpportunitiesKanban.tsx`
- Causa atual identificada: a tela hoje renderiza `<Layout>` diretamente; não há branch ativo com `if (isMobile)`, então o mobile nunca entra em um layout separado.