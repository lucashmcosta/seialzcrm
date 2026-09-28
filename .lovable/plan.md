# Remover o aviso neutro de "Sem inbound recente"

## Mudança (só apresentação)
1. `MessagesList.tsx`: remover `showNoInboundHint` e parar de passar `noRecentInbound` para o `SalesComposerStatus`. O aviso continua sendo ligado só por `templateOnly = !serviceWindow.isOpen && messages.length > 0 && composerAllowsFreeformOutsideWindow === false`.
2. `SalesComposerStatus.tsx`: remover a prop `noRecentInbound` e o aviso neutro ("O cliente não enviou mensagem recentemente."). Ficam:
   - "Sem rota", com a mesma prioridade de hoje;
   - "Sem inbound recente — Somente mensagens de template estão disponíveis." (`templateOnly`).

Não mudam: o bloqueio do campo, a escolha do número, o envio, os templates, as capabilities e as feature flags.

## Validação
- Evolution 7020 fora de 24h: campo livre, nenhum aviso.
- Meta 7067 fora de 24h: campo bloqueado, com o aviso de template.
- Dentro de 24h: nenhum aviso.
- Checar que o código compila e publicar.
