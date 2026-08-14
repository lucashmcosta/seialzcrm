# Corrigir mensagens grudadas dentro dos containers da timeline

O espaçamento entre bolhas voltou a 2px porque, ao introduzir o colapso por altura, cada mensagem passou a ser envolvida por um `<div>` de medição dentro do `TimelineBlock`, e o container recebeu `space-y-0.5`. O agrupamento visual continua usando `-mt-2.5` esperando um espaçamento base de 12px (`space-y-3`), então tudo colou.

## Correção (apenas visual)

1. `src/components/messages/timeline/TimelineBlock.tsx`: envolver a lista de mensagens visíveis em um wrapper com `space-y-3`, de forma que cada `<div>` de medição volte a ter 12px de separação. O `ref` de medição permanece em cada item (altura real preservada) e a ancoragem de scroll não muda.
2. `src/pages/messages/MessagesList.tsx` (linha ~2715): remover o `space-y-0.5` do container do `TimelineBlock`, deixando o espaçamento a cargo do wrapper interno; cabeçalho e separador "Ver N mensagens anteriores" mantêm suas próprias margens (`my-1`).

Resultado: mensagens continuadas do mesmo remetente ficam com ~2px (12px − 10px do `-mt-2.5`), e mensagens de remetentes/grupos diferentes voltam aos 12px, como antes da mudança.

## Não muda

Colapso por altura real, orçamento visual, ancoragem de scroll, cabeçalhos, agrupamento, paginação, realtime, envio, backend.

## Verificação

- `tsgo` limpo e suíte de testes.
- Validação visual em `/commercial`: bolhas com respiro normal, agrupamento contínuo preservado e "Ver N mensagens anteriores" ainda sem mover o scroll.
