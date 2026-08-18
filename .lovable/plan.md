# Auditoria: por que nascem TimelineBlocks repetidos em /commercial

## 1. Onde a decisão é tomada

Duas camadas, ambas puramente visuais:

- `src/lib/messageGrouping.ts` → `computeContextBlocks(items)` chama `continuesBlock(prev, curr, outbound)`. É aqui que se decide `isBlockStart` / `blockIndex`.
- `src/pages/messages/MessagesList.tsx`:
  - linhas ~2256-2325: pré-passe que monta os descritores (`dateBreak`, `endpointBreak`, `endpointId`, `provider`, `senderType`, `senderId`, `kind`).
  - linhas ~2705-2737: segunda fase que transforma os itens em `segments`; só itens com `kind === 'message'` entram no cartão (`isInsideCard`), e um novo segmento `block` é aberto sempre que o segmento imediatamente anterior não for um `block` com o mesmo `blockIndex`.

## 2. Condições que hoje abrem um novo bloco

Em `continuesBlock`:
1. `curr.kind !== 'message'` ou `prev.kind !== 'message'` — nota interna, evento de sistema, evento de CRM.
2. `curr.dateBreak` — virada de dia.
3. `curr.endpointBreak` — troca de número (só quando os dois endereços são conhecidos e diferentes).
4. `prev.endpointId !== curr.endpointId` — troca de endpoint_id, mesmo com o mesmo número.
5. `prev.provider !== curr.provider`.
6. Identidade outbound diferente: `senderType` ou `senderId` do último outbound do bloco ≠ do outbound atual (inbound não quebra, mas propaga a identidade).

Em `MessagesList.tsx` (efeito visual adicional):
7. Qualquer item fora do cartão (nota, activity, evento de sistema) empurra um segmento `loose`; a mensagem seguinte, mesmo com o mesmo `blockIndex`, abre um cartão novo, porque a checagem olha apenas o último segmento.

## 3. Qual delas causa o caso da imagem

Condição 6 — identidade do outbound.

Dados reais da thread "Bruno Silva de Araujo" (endpoint `3ed219e0…` = Evolution (11) 5028-7020), todos com o MESMO endpoint e provider:

```text
18:51 outbound  sender_type=user  sender_user_id = NULL
19:06 inbound
19:07 outbound  sender_type=user  sender_user_id = 36497cc4-…
19:08 inbound
...
```

O outbound de 18:51 chegou com `sender_user_id` nulo (envio pelo pipeline Evolution) e o de 19:07 com o id do operador. Como `senderId` muda (`null` → `36497cc4`), `continuesBlock` devolve `false` e nasce um container novo com o cabeçalho idêntico `WhatsApp • Evolution • (11) 5028-7020`. O mesmo acontece a cada troca/ausência de operador. A condição 7 agrava o efeito quando há nota interna no meio (há uma às 16:35 nessa conversa).

Não é áudio, anexo, horário, direção nem agrupamento de bolhas: `GROUP_GAP_MS` e direção já não quebram bloco.

## 4. Alteração mínima proposta

Somente apresentação, dois arquivos.

`src/lib/messageGrouping.ts` — reduzir `continuesBlock` a UMA única condição:
- quebra somente se `curr.endpointBreak` (troca real do número usado na conversa);
- nada mais quebra: nem `dateBreak`, nem `endpointId`/`provider` crus, nem identidade outbound, nem `kind`.

O parâmetro `outbound` e sua propagação em `computeContextBlocks` deixam de ser necessários. `computeMessageGroups` (agrupamento interno de bolhas, com gap de 5 min, reply, falha, autor) fica intacto.

`src/pages/messages/MessagesList.tsx`:
- o separador de data (`TimelineEventMarker` com HOJE/ONTEM/data) continua sendo renderizado no ponto cronológico correto, mas passa a aparecer DENTRO do container corrente, como marcador entre as mensagens — sem abrir cartão novo. Na montagem dos `segments`, o separador deixa de ser empurrado como `loose` quando existe um bloco corrente: ele entra em `messageNodes` do bloco.
- notas, activities e eventos de sistema seguem o mesmo tratamento: recebem o `blockIndex` do bloco corrente e não partem o cartão; ao encontrar a próxima mensagem, reaproveitar o último segmento `block` de mesmo `blockIndex` em vez de exigir que ele seja o segmento imediatamente anterior.
- o `blockHeader` continua sendo emitido apenas no `isBlockStart`, que passa a significar exclusivamente "início da conversa ou troca de número".

Consequência: exatamente um container por número (7020 … 7067 …), atravessando dias, notas, eventos e trocas de operador; a data permanece visível como marcador cronológico interno. Colapso por altura, ancoragem de scroll, envio, roteamento, paginação e realtime inalterados.

Testes a ajustar em `tests/message-grouping.test.ts`: os casos "troca de operador", "entrada de IA", "troca de provider", "troca de endpoint" (sem troca de número), "evento de sistema e nota interna são blocos próprios" e o de `dateBreak` passam a esperar continuidade; permanece apenas `endpointBreak` como quebra.


## Verificação

- `tsgo` limpo e suíte de testes atualizada.
- Validação visual sua em `/commercial` na thread do Bruno: um único container por número (7020 / 7067), separador de data dentro do container, sem cabeçalhos 7020 repetidos.
