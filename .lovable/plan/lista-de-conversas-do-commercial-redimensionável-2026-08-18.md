# Lista de conversas do /commercial redimensionável

Somente UI/apresentação. Nada de query, ordenação, realtime, backend ou modelo de thread.

## Auditoria — quem controla a largura hoje

- `src/pages/messages/MessagesList.tsx`, linha 1909: a coluna esquerda é uma `div` com `w-[400px] flex-shrink-0 border-r border-border ...`. Não há hook, contexto ou componente de resize; a largura é literal no Tailwind.
- A conversa aberta (linha 2086) já é `flex-1`, então ela absorve automaticamente o espaço restante — nenhuma mudança necessária ali.
- Mobile é um componente separado: `MessagesList` retorna `<MobileMessagesList />` quando `useIsMobile()` é verdadeiro (linhas 3372-3373). Logo o resize vive apenas no caminho desktop e o mobile fica intocado por construção.
- `ChatListItem` (linhas 266-315) já tem a estrutura correta: coluna `min-w-0 flex-1`, linha do nome com `justify-between`, nome+badge em bloco `min-w-0`, horário em `span shrink-0`, e o preview com `min-w-0 truncate` em `LastMessagePreview.tsx`.

## Alteração mínima

### 1. Estado de largura persistido
Novo hook `src/hooks/useResizableListWidth.ts`:
- Largura padrão `400` (a atual), mínimo `320`, máximo `520`.
- Inicialização sincronizada: lê `localStorage` (`seialz:commercial:list-width`) e faz clamp no range; valor inválido cai no padrão.
- Grava no `localStorage` ao final do drag e no double click de reset.
- Expõe `width`, `isResizing`, `startResize(event)`, `reset()`.
- Drag via `pointermove`/`pointerup` em `window`, com clamp contínuo; `pointercancel` também encerra.

### 2. Divisória
Em `MessagesList.tsx` (desktop):
- A coluna esquerda passa a usar `style={{ width }}` com `shrink-0` (removendo `w-[400px]`); a borda direita sai da coluna e vai para a divisória.
- Nova divisória `role="separator"` de 4px (área de clique ~6px) entre a lista e a conversa, com `cursor-col-resize`, realce discreto em hover/arraste usando tokens semânticos, `onPointerDown={startResize}` e `onDoubleClick={reset}`.
- Acessibilidade básica: `aria-orientation="vertical"`, `tabIndex={0}` e setas esquerda/direita ajustando 16px.
- Durante o resize, aplicar `select-none` e `cursor-col-resize` no `document.body` (removido ao soltar) para não selecionar texto.
- A conversa continua `flex-1`, ocupando o restante.

### 3. Revisão do `ChatListItem`
Manter a estrutura atual e garantir que o horário nunca seja empurrado:
- Bloco nome+badge recebe `flex-1` além do `min-w-0` já existente, para que ele encolha antes do horário.
- Horário permanece `shrink-0` com `whitespace-nowrap` explícito.
- Preview permanece `min-w-0 truncate` (já corrigido em `LastMessagePreview.tsx`).
- Nenhum campo, hook ou fonte de dado alterado — `value.updated_at` e `formatRelativeTime` seguem iguais.

## Notas técnicas

- Arquivos alterados: `src/pages/messages/MessagesList.tsx` (bloco de layout desktop + `ChatListItem`), novo `src/hooks/useResizableListWidth.ts`.
- Não toca `MobileMessagesList`, `InboxPage`, componentes de rota, hooks de dados, RPCs, triggers ou Edge Functions.
- Módulo afetado: Messages/Comercial. Sem impacto em Atendimento (ADR-0009 preservado).

## Validação

1. Largura padrão renderiza igual ao layout atual (400px).
2. Tempo relativo visível à direita do nome na largura padrão e nos extremos 320/520.
3. Drag aumenta/diminui respeitando os limites; sem seleção de texto durante o arraste.
4. Preferência persiste após reload; double click volta a 400px.
5. Conversa central ocupa o espaço restante sem quebra de composer/timeline.
6. Sem regressão em seleção de conversa, scroll infinito da lista e busca; typecheck e build limpos.
