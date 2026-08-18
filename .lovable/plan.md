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

`src/lib/messageGrouping.ts` — reduzir `continuesBlock` a:
- quebra se `curr.dateBreak`;
- quebra se `curr.endpointBreak` (troca real de número);
- nada mais.

Ou seja: remover as checagens de identidade outbound (`outbound.senderType/senderId`), de `endpointId` cru, de `provider` e do `kind`. O parâmetro `outbound` e sua propagação em `computeContextBlocks` deixam de ser necessários. `computeMessageGroups` (agrupamento interno de bolhas, com gap de 5 min, reply, falha, autor) fica intacto.

`src/pages/messages/MessagesList.tsx`:
- notas, activities e eventos de sistema continuam renderizados fora do cartão, mas passam a receber o `blockIndex` do bloco corrente; na montagem dos `segments`, ao encontrar uma mensagem, reaproveitar o último segmento `block` de mesmo `blockIndex` em vez de exigir que ele seja o segmento imediatamente anterior — assim uma nota no meio não parte o container em dois cartões com o mesmo cabeçalho.
- o `blockHeader` continua sendo emitido apenas no `isBlockStart`, o que passa a significar "início da conversa, virada de dia ou troca de número".

Consequência: um cabeçalho por número (e por dia), sem repetição; colapso por altura, ancoragem de scroll, envio, roteamento, paginação e realtime inalterados.

Testes a ajustar em `tests/message-grouping.test.ts`: os casos "troca de operador abre novo bloco", "entrada de IA abre novo bloco", "troca de provider abre novo bloco", "troca de endpoint abre novo bloco" (sem troca de número) e "evento de sistema e nota interna são blocos próprios" passam a esperar continuidade; permanecem os casos de `dateBreak` e `endpointBreak`.

## Verificação

- `tsgo` limpo e suíte de testes atualizada.
- Validação visual sua em `/commercial` na thread do Bruno: um único container por número/dia, sem cabeçalhos 7020 repetidos.
