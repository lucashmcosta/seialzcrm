## Objetivo
Corrigir a tela `/tasks` no mobile, que hoje renderiza o `<Layout>` desktop comprimido (sidebar aparecendo sobre o conteúdo).

## Plano
1. Em `src/pages/tasks/TasksList.tsx`, adicionar `useIsMobile()` e, quando `isMobile === true`, renderizar dentro de `<MobileLayout>` em vez do `<Layout>` desktop.
2. Criar `src/components/mobile/MobileTasksList.tsx` seguindo o mesmo padrão de `MobileContactsList` / `MobileOpportunitiesKanban`:
   - Header simples com título "Tarefas" e botão "+" para nova tarefa
   - Busca compacta
   - Filtro de status como abas roláveis horizontalmente (Atrasadas / Hoje / Abertas / Concluídas)
   - Lista vertical de cards (não kanban) com: prioridade, título, contato/oportunidade, data, ações de concluir/editar acessadas via tap no card
   - Loading com `MobileSpinner`, empty state simples
3. Reusar dialogs existentes (`TaskDialog`, `CompleteTaskDialog`) — eles já funcionam em mobile.
4. Não alterar o branch desktop (kanban + lista) que já está aprovado.

## Detalhes técnicos
- Arquivo principal: `src/pages/tasks/TasksList.tsx` (adicionar branch `if (isMobile)`)
- Novo arquivo: `src/components/mobile/MobileTasksList.tsx`
- Padrão de referência: `src/components/mobile/MobileContactsList.tsx` e `src/pages/opportunities/OpportunitiesKanban.tsx`
- O fetch/queries permanecem na page; o componente mobile recebe `tasks`, `loading`, callbacks via props (igual `MobileContactsList`).
