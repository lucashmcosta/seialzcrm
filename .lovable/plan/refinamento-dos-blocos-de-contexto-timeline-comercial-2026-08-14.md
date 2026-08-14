# Refinamento dos blocos de contexto (timeline Comercial)

Mudança apenas de presentação e da regra de quebra de cartão. Arquivos tocados: `src/lib/messageGrouping.ts`, `src/pages/messages/MessagesList.tsx`, `src/lib/whatsappEndpointDisplay.ts` (rótulo amigável) e `tests/message-grouping.test.ts`. Nada de SQL, RPC, Edge Function, hook, query, realtime, paginação, Atendimento ou Mobile.

## 1. Cartão = contexto técnico (não direção)

Em `computeContextBlocks()` → `continuesBlock()`:

- remover a quebra por `direction` (cliente e operador ficam no mesmo cartão);
- remover a quebra por `senderType` puro; passar a quebrar por **identidade do operador/IA** apenas quando a mensagem é outbound: se `curr.direction !== 'inbound'` e `prev.direction !== 'inbound'`, comparar `senderType` e `senderId`. Mensagens inbound entre duas outbound do mesmo operador não quebram o cartão (a identidade outbound corrente é propagada, não zerada por um inbound);
- manter as quebras já aprovadas: `endpointId`, `provider`, `dateBreak`, `endpointBreak` (Número alterado), `kind !== 'message'` (nota interna e evento de sistema).

Resultado: novo cartão só quando muda número, provider, operador/IA, ou quando entra nota interna, evento de sistema, troca de dia ou "Número alterado" — este último fecha o cartão anterior e o próximo cartão abre logo abaixo (comportamento já existente, preservado).

`computeMessageGroups()` (agrupamento interno de bolhas, 5 min) fica inalterado.

## 2. Cabeçalho do cartão

Agora o cartão contém os dois lados, então o cabeçalho descreve o contexto:

- Linha 1 (destaque): nome do operador/IA responsável do bloco quando houver mensagem outbound; caso o bloco seja só do cliente, nome do contato (ou "Cliente"). Badge/ícone de IA mantido quando `sender_type = 'agent'`.
- Linha 2 (menor, `text-muted-foreground`): `WhatsApp • (11) 5026-2890`, com sufixo de provider só quando não for o padrão: `WhatsApp • (11) 93619-8439 • Evolution`.
- Rótulos amigáveis obrigatórios: `Meta`, `Evolution`, `Twilio`. Hoje `PROVIDER_LABELS` devolve "Meta Cloud API" e não cobre `evolution_api`; será adicionada `whatsappProviderShortLabel()` em `src/lib/whatsappEndpointDisplay.ts` mapeando `meta_cloud_api → Meta`, `evolution_api → Evolution`, `twilio`/`twilio_whatsapp_api → Twilio`, usada apenas pelo cabeçalho (a função atual continua para as outras telas).
- Hierarquia: nome em `text-xs font-medium text-foreground`, linha do WhatsApp em `text-[10px] text-muted-foreground font-data`.
- O cabeçalho passa a ser alinhado à esquerda dentro do cartão (não mais espelhado por direção), já que o cartão agora contém os dois lados.

## 3. Layout do cartão

No segmento `type: 'block'` de `MessagesList.tsx`:

- largura acompanha o conteúdo: `w-fit max-w-[88%]`;
- alinhamento: `ml-auto` quando todas as mensagens do cartão são outbound, `mr-auto` quando todas são inbound, `mr-auto` (esquerda) quando o cartão é misto;
- peso visual leve: `border border-border/30 bg-muted/10 rounded-lg`, sem sombra;
- padding reduzido: `px-2.5 py-1.5`;
- espaçamento interno entre mensagens `space-y-0.5`; espaçamento entre cartões maior via `mt-4` no contêiner do cartão (mantendo o `space-y` atual da timeline para os elementos soltos).

Separadores de data, "Número alterado", eventos de sistema e notas internas continuam fora dos cartões, centralizados.

## 4. Não muda

Agrupamento interno de bolhas, horário/status, hover, responder, copiar, encaminhar, menu contextual, seleção, realtime, paginação, backend.

## Verificação

- `tsgo` limpo.
- `tests/message-grouping.test.ts`: ajustar o caso "troca de direção quebra bloco" para o novo contrato (não quebra) e adicionar: inbound entre duas outbound do mesmo operador mantém o cartão; troca de operador quebra; troca de endpoint/provider quebra; nota interna e evento de sistema quebram; gap > 5 min não quebra cartão.
- Validação visual sua no preview autenticado (`/commercial`): cartões justos ao conteúdo, sem áreas vazias, cabeçalho com número formatado e provider amigável.
