# Fase 0 — Edição Evolution 7020: sem vs com MESSAGES_EDITED

Somente diagnóstico. Sem migration, sem Edge Function, sem UI, sem handler.

## Escopo
- Instância: `evo-40ae935c-628b2eab` (Central, 551150287020)
- Destino de teste: 11964298621
- Chamadas via curl direto na Vultr, credenciais redigidas em toda saída.
- Cada mensagem é editada uma única vez.

## Teste A — sem MESSAGES_EDITED (configuração atual)
1. Marcar o horário de início (UTC).
2. Enviar texto novo `SEIALZ-FASE0-A <timestamp>` via `POST /message/sendText/{instance}`; guardar `key.id`, `remoteJid` e a resposta bruta.
3. Conferir no banco se a mensagem chegou ao Seialz (eco por `MESSAGES_UPSERT` do fromMe) e qual `whatsapp_message_sid` ficou salvo.
4. Cerca de 1 minuto depois, `POST /chat/updateMessage/{instance}` com `{ number, key: { remoteJid, fromMe: true, id }, text: "SEIALZ-FASE0-A EDITADA" }`; guardar request (sem key) e response exatos.
5. Aguardar cerca de 60 s e coletar:
   - `integration_inbound_events` da instância desde o início (tipo do evento, payload bruto, referência ao ID original);
   - logs da função `evolution-webhook` no mesmo intervalo;
   - se a linha em `messages` mudou.
6. Pedir a você que confirme o que aparece no celular (texto editado / rótulo "Editada").

## Teste B — com MESSAGES_EDITED
1. Fazer `GET /webhook/find/{instance}` e salvar a configuração completa como backup.
2. `POST /webhook/set/{instance}` mantendo URL, `enabled`, `webhookByEvents:false`, `webhookBase64:false`, headers e os 4 eventos atuais, acrescentando apenas `MESSAGES_EDITED`.
3. Repetir `GET /webhook/find` e confirmar que só esse evento foi acrescentado. Se qualquer outro campo mudar, restaurar o backup e parar.
4. Repetir os passos A.2–A.6 com uma nova mensagem `SEIALZ-FASE0-B`.
5. Se o webhook descartar o evento como desconhecido, isso é aceitável: o objetivo é registrar o payload, buscando em inbound events, dead letters, ingest errors ou logs.
6. `MESSAGES_EDITED` permanece ligado ao final, salvo se você pedir para desligar.

## Entrega
Tabela comparativa entre A e B com estes itens:
- request/response do updateMessage
- evento(s) recebido(s): upsert, update, edited, protocolMessage ou editedMessage
- payload bruto
- ID original referenciado
- se `whatsapp_message_sid` bate
- efeito na tabela `messages`
- comportamento no celular

A janela de edição (testes de 10/15/20/30 min) fica para uma etapa posterior, se aprovada.

## Riscos
- Duas mensagens reais vão para 11964298621.
- `webhook/set` sobrescreve a configuração inteira, então o backup e a verificação são obrigatórios.
