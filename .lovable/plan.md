# Aviso laranja coerente com o estado do campo

## O que está errado
Em `MessagesList.tsx`, o aviso "Sem inbound recente — Somente mensagens de template estão disponíveis." é ligado por:

```text
showNoInboundHint = !outOfWindow && composerAllowsFreeformOutsideWindow && !serviceWindow.isOpen && messages.length > 0
```

Hoje ele aparece exatamente no caso em que o texto livre está liberado (Evolution 7020) e não aparece quando o campo está bloqueado (Meta 7067). Ou seja, a condição está invertida em relação ao texto do aviso.

## Correção (só apresentação)
1. `SalesComposerStatus.tsx`: separar os dois casos, sem nenhuma lógica de bloqueio.
   - `templateOnly` → "Sem inbound recente" / "Somente mensagens de template estão disponíveis." (texto atual).
   - `noRecentInbound` (neutro) → "Sem inbound recente" / "O cliente não enviou mensagem recentemente." — sem dizer que só templates estão disponíveis.
2. `MessagesList.tsx`, onde o aviso é mostrado:
   - `templateOnly = !serviceWindow.isOpen && messages.length > 0 && composerAllowsFreeformOutsideWindow === false`
   - `noRecentInbound = !serviceWindow.isOpen && messages.length > 0 && composerAllowsFreeformOutsideWindow === true`

A prioridade do aviso "Sem rota" fica como está.

Não mudam: escolha do número, `requires_template_outside_window`, envio, templates, feature flag, regras Meta/Evolution, e o próprio bloqueio do campo (`outOfWindow`).

## Validação
- Evolution 7020 fora de 24h: campo liberado, só o aviso neutro, sem falar em template.
- Meta 7067 fora de 24h: campo bloqueado, com o aviso "Somente mensagens de template estão disponíveis."
- Dentro de 24h: nenhum aviso.
- Depois, publicar.
