# Eventos de sistema não podem segmentar o TimelineBlock

## O que foi verificado agora (leitura, sem alterações)

- `src/lib/messageGrouping.ts` (linhas 135-138): `continuesBlock` já quebra **apenas** em `curr.endpointBreak`.
- `src/pages/messages/MessagesList.tsx` (linhas 2712-2755): notas, activities de sistema, eventos de CRM, mensagens `kind: 'system'` (migração de endpoint) e separadores de data já são empurrados para `currentBlock.messageNodes` quando existe bloco corrente.
- O código servido pelo dev server já contém essas duas versões (conferido no módulo transformado pelo Vite), então o print enviado corresponde a um render anterior ao ajuste, ou a um caminho residual descrito abaixo.
- Thread "Bia" (+5511915061567): todas as mensagens usam o mesmo endpoint `3ed219e0…` (`evolution_api`, `+551150287020`). Com a regra atual, `endpointBreak` nunca é verdadeiro nessa conversa — logo deveria existir exatamente **um** container.

## Caminho residual que ainda pode criar bloco novo

Na montagem dos `segments` a continuidade é decidida indiretamente, comparando `currentBlock.blockIndex !== r.blockIndex` (linha 2742). Qualquer divergência de `blockIndex` — desalinhamento entre `chatItems` e `blockFlags`, fallback `?? { blockIndex: 0 }`, item sem flag — anula o bloco corrente, joga o evento como `loose` e faz a mensagem seguinte abrir um cartão novo com cabeçalho idêntico. Ou seja: a invariante depende de um índice, não da única condição legítima.

## Correção proposta (somente apresentação)

`src/pages/messages/MessagesList.tsx`, fase de `segments`:

1. Trocar o critério de corte: abrir bloco novo **apenas** quando `r.endpointBreak === true` (levado do descriptor para o item renderizado) **ou** quando não existir `currentBlock`. Remover a anulação por `blockIndex` divergente.
2. Manter `currentBlock` intacto ao processar itens `note`, `system`, `event`/activity e separadores de data — eles continuam entrando em `messageNodes` como `TimelineEventMarker`.
3. `blockHeader`: emitir por bloco visual efetivamente criado (contador do próprio laço de segmentos) em vez de `headerEmittedBlocks` por `blockIndex`, evitando cabeçalho ausente/duplicado quando os índices divergem.
4. Eventos anteriores à primeira mensagem seguem `loose` (não existe bloco corrente ainda).

Nada de backend, hooks, dados, ordenação, paginação, envio ou roteamento.

## Verificação

- `tests/message-grouping.test.ts`: manter a suíte atual (só `endpointBreak` quebra) e acrescentar um caso cobrindo sequência mensagem → evento de sistema → nota → mensagem em um único bloco.
- `tsgo` limpo.
- Checagem visual na thread "Bia" em `/commercial`: um único container `WhatsApp • Evolution • (11) 5028-7020`, com "Conversa criada" e "Contato auto-atribuído via round-robin" como marcadores internos.
