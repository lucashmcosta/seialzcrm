## Objetivo
Remover o botão de "Ocultar conversa" (ícone do olho) que aparece em cada item da lista de conversas, mantendo a opção apenas dentro do menu de Ações.

## Mudança
**Arquivo:** `src/pages/messages/MessagesList.tsx`

1. Remover o bloco do botão `<EyeSlash>` (linhas 187–202) renderizado dentro do item da lista de conversas, junto com a prop `onHide` passada ao componente do item.
2. Remover o import `EyeSlash` da linha 61 **somente** se não for mais usado — ele continua sendo usado no menu de Ações (linha 1388), então o import permanece.
3. Manter intactos:
   - `useHiddenThreads` e os handlers `hideThread` / `unhideThread` (linhas 1125, 1133, 1144).
   - O item "Ocultar conversa" no dropdown de Ações (linhas 1388–1389).
   - A funcionalidade de "mostrar conversas ocultas" / unhide.

Sem mudanças em outros arquivos.