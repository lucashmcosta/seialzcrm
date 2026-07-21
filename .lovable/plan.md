
## Diagnóstico

Em `supabase/functions/evolution-webhook/index.ts` (linhas 1341–1345), todo `MESSAGES_UPSERT` com `key.fromMe === true` é descartado explicitamente:

```
if (parsed.fromMe) {
  await markInboundEvent(..., "fromMe_true_outbound_ignored_phase6a");
  return json(200, { ..., reason: "FROM_ME_SKIPPED" });
}
```

Isso significa que **qualquer mensagem enviada pela Marlisa direto no celular do 8439** (ou eco de mensagens enviadas via CRM) nunca é gravada. A UI só recebe os `fromMe=false`. É esse o motivo do histórico "meio faltando".

O parser (`parseMessagesUpsert`) já extrai `fromMe`, `waMessageId (key.id)`, `remoteJid`, `pushName`, mídia, quoted, etc. — tudo que precisamos. `ingestInboundMessage` já resolve org, contato, thread (com merge/reuso), mídia, reply-to, idempotência por `whatsapp_message_sid`.

## Correção (escopo mínimo)

### 1. Remover o short-circuit de `fromMe`

Substituir o `if (parsed.fromMe) return SKIP` por uma bifurcação: chamar um novo `ingestOutboundEchoMessage(...)` quando `fromMe=true`, e manter `ingestInboundMessage(...)` para o resto.

### 2. Novo caminho outbound (device echo)

Reutilizar 100% dos helpers existentes (`jidToE164`, `resolveInboundSettings`, `findOrCreateContact`, `findOrCreateThread`, `downloadEvolutionMedia`, `resolveReplyToMessageId`). Diferenças em relação ao inbound:

- **Dedup primeiro, sempre.** Antes de qualquer efeito colateral, `SELECT id, direction FROM messages WHERE organization_id=? AND whatsapp_message_sid=key.id`. Se existir → no-op (é eco de envio pelo CRM, já persistido pelo `evolution-whatsapp-send`); apenas marcar `integration_inbound_events.process_status='processed'` com `processError='echo_of_crm_send'` para observabilidade. Nunca inserir duplicata.
- **Se não existir:** inserir com
  - `direction='outbound'`
  - `sender_type='agent'` (padrão usado por `evolution-whatsapp-send`; confirmar no arquivo antes de gravar)
  - `sender_name = parsed.pushName ?? null`
  - `endpoint_id = ctx.endpointId` (Evolution 8439)
  - `whatsapp_message_sid = parsed.waMessageId`
  - `whatsapp_status = 'sent'` (o próprio aparelho já enviou; `MESSAGES_UPDATE` posterior sobe para delivered/read via `applyMessageStatus`, que já casa por wamid)
  - `sent_at` derivado de `messageTimestamp`
  - `metadata.evolution.from_me = true`
  - `metadata.evolution.origin = 'device'`
  - `reply_to_message_id` via `resolveReplyToMessageId`
  - mídia via `downloadEvolutionMedia` no mesmo bucket/prefixo (`.../evolution-inbound/` — reaproveitar path atual; não vale criar prefixo novo neste patch).
- **Thread:** exatamente o mesmo `findOrCreateThread(org, contact, endpointId, ts)` usado no inbound — mesma lógica de reuso e respeito a `merged_into_thread_id`. Não criar thread duplicada, não mexer em `primary_endpoint_id`.
- **Contato:** `findOrCreateContact` igual ao inbound. Se `auto_create_contact=false` retornar `null`, marcar `process_status='failed'` com `no_contact` e sair sem persistir.
- **Sem side-effects extras que só fazem sentido para inbound:**
  - **Não** chamar `notifyContactOwner` (é mensagem do próprio operador).
  - **Não** chamar `insertActivity` do tipo "message" com direção inbound.
  - **Não** disparar `triggerAiAgentOrFlagHuman` (não é fala do cliente; evita o SDR responder ao próprio agente).
  - Atualizar apenas `updated_at` no thread; **não** mexer em `last_inbound_at` / `whatsapp_last_inbound_at`. (A janela 24h só deve andar quando o cliente fala.)

### 3. Idempotência por wamid — regra única

`whatsapp_message_sid = key.id` continua sendo a fonte de verdade. Serve para três cenários:
1. Inbound reprocessado → já era coberto.
2. Outbound do CRM ecoando via webhook → agora coberto pelo SELECT prévio.
3. Outbound do celular chegando duas vezes → coberto pelo mesmo SELECT + captura de `23505` no insert.

Nunca deduplicar por `fromMe`.

### 4. `MESSAGES_UPDATE` / `MESSAGE_RECEIPT_UPDATE`

`applyMessageStatus` já casa por `whatsapp_message_sid` e faz `UPDATE messages SET whatsapp_status=...`. Como agora persistimos o outbound do device, os acks (delivered/read) que a Evolution envia para esses wamids passam a atualizar linhas reais em vez de virarem no-op. Nenhuma mudança nesse caminho.

## Escopo do diff

Apenas `supabase/functions/evolution-webhook/index.ts`:
- Remover o early-return `FROM_ME_SKIPPED`.
- Adicionar `ingestOutboundEchoMessage(...)` (fatoração leve a partir de `ingestInboundMessage`, sem duplicar helpers).
- Ajustar o roteamento de `MESSAGES_UPSERT` para escolher inbound vs outbound.

Sem tocar em: Meta webhook, Twilio webhook, `dispatchWhatsAppSend`, `evolution-whatsapp-send`, `thread-migrate-endpoint-send`, composer, UI, migrations, outros tenants, feature flag. Sem componente novo — os renderers atuais já pintam `direction='outbound'` corretamente.

## Validação em produção (piloto Viagi, thread da Ralis/cliente da Marlisa)

Antes: `SELECT id, whatsapp_status FROM messages WHERE thread_id=<thread> ORDER BY sent_at DESC LIMIT 10` para snapshot.

Passos manuais com a Marlisa:
1. Enviar **texto** pelo celular do 8439 → conferir aparece como outbound no `/messages` e no `atendimento`, mesma thread, endpoint Evolution.
2. Cliente responde texto → inbound aparece; mesma thread; sem duplicata.
3. Enviar **imagem** pelo celular → outbound com `media_urls` populado.
4. F5 na thread → tudo permanece.
5. Enviar **áudio/PTT** e **documento** — repetir asserções.
6. Enviar uma mensagem pelo **CRM** (composer Evolution) → conferir que o eco do webhook **não** cria linha duplicada (mesmo `whatsapp_message_sid`, uma linha só). Checar `integration_inbound_events` para o `processError='echo_of_crm_send'`.
7. SQL final:
   ```
   SELECT direction, whatsapp_message_sid, endpoint_id, sender_type, metadata->'evolution'->>'origin'
   FROM messages WHERE thread_id=<thread> ORDER BY sent_at DESC LIMIT 20;
   ```
   Confirmar mix inbound/outbound, wamids únicos, endpoint = Evolution 8439, `origin='device'` nos envios pelo aparelho.

## Fora do escopo

- Sticker/vCard/location outbound: os parsers já existem no arquivo (usados no inbound); o outbound-echo herda automaticamente. Sem trabalho extra além de conferir no teste manual.
- Marcador visual "enviado pelo aparelho" na bolha: só metadata por ora, sem chip novo, conforme pedido.
