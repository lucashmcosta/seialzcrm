# Corrigir os "dois checks" e o check azul no número 7020

## O que está acontecendo

O 7067 (Meta) recebe do WhatsApp os avisos de "entregue" e "lido" e a conversa mostra dois checks e o check azul.

O 7020 (Evolution) também recebe esses avisos — nas últimas 48h chegaram 98 avisos de atualização de status — mas **todos foram descartados com o erro `missing_wamid`**. Por isso toda mensagem enviada pelo 7020 fica travada em um único check ("enviada"), independentemente de ter sido entregue ou lida.

Motivo: o aviso do 7020 identifica a mensagem no campo `data.keyId`, mas o código só procura em `data.key.id` ou `data.id`. Como não encontra o identificador, aborta antes de atualizar a mensagem.

Confirmado nos dados de hoje:
- aviso recebido: `{ keyId: "3EB0DE17FF8B92139A8F98", status: "DELIVERY_ACK" }`
- mensagem no banco com o mesmo identificador salvo, mas status ainda "sent"
- as últimas 8 mensagens enviadas pelo 7020 estão todas em "sent"

Ou seja: o dado necessário existe e casa perfeitamente; falta apenas ler o campo certo.

## Correção

1. Na leitura do aviso de status do Evolution, aceitar também `data.keyId` (além de `data.key.id` e `data.id`).
2. Reprocessar os avisos recentes que ficaram com erro, para que as conversas já existentes passem a exibir os dois checks / check azul retroativamente.
3. Validar: enviar uma mensagem pelo 7020 e acompanhar a evolução de um check → dois checks → azul ao ser lida.

Nada muda no 7067 nem no envio em si; a mudança é apenas na leitura do aviso de status.

## Detalhes técnicos

- Arquivo: `supabase/functions/evolution-webhook/index.ts`, função `applyMessageStatus` (extração do `wamid`).
- O mapeamento de status já está correto: `SERVER_ACK` → sent, `DELIVERY_ACK` → delivered, `READ`/`PLAYED` → read.
- O identificador salvo em `messages.whatsapp_message_sid` pelo `evolution-whatsapp-send` é o `key.id` do Baileys, idêntico ao `keyId` do webhook — o `UPDATE ... where whatsapp_message_sid = wamid` passa a casar.
- Reprocessamento: replay dos eventos `messages.update` em `integration_inbound_events` com `process_status='failed'` e `process_error='missing_wamid'` (a idempotência por `idempotency_key` já protege contra duplicidade).
