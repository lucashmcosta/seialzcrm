Adicionar "Atendimento" (`/inbox`) à barra de tabs inferior do `MobileLayout`, com o ícone `Headset` (`@phosphor-icons/react`), posicionado logo após "Mensagens".

## Mudanças

`src/components/mobile/MobileLayout.tsx`:
- Importar `Headset` do `@phosphor-icons/react`.
- Adicionar à lista `tabs` (após o push condicional de Mensagens):
  `tabs.push({ label: 'Atendimento', href: '/inbox', icon: Headset });`
- Adicionar também ao `drawerItems` (menu hambúrguer) na mesma posição, para consistência.

## Ajuste de espaço

Com isso a tab bar passa a ter até 6 itens em telas estreitas (390px). Para evitar que os rótulos quebrem:
- Trocar `text-[10px]` por `text-[9px]` apenas quando há 6 ou mais tabs, OU
- Manter `text-[10px]` e adicionar `truncate` + `px-0.5` nos itens.

Vou usar a opção mais simples: `truncate max-w-full px-0.5` no `<span>` do rótulo, mantendo o tamanho atual.

## Fora de escopo

- Sem mudanças em rotas, permissões, regras de visibilidade, badges de contagem ou no `InboxPage`.
- Sem mexer em desktop nem em `MobileInbox`.
