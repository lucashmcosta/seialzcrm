## Objetivo

Ao receber um inbound Evolution de um contato que já tem thread WhatsApp (Twilio/Meta) na mesma organização, **reutilizar** a thread existente ao invés de criar uma nova. Atualizar `primary_endpoint_id` para o endpoint Evolution, preservando todo o histórico. O divisor visual "📞 Número alterado" aparece automaticamente, pois é derivado da mudança de `messages.endpoint_id` entre mensagens consecutivas (renderizado em `MessagesList.tsx`, sem helper server-side).

## Diagnóstico

- **`supabase/functions/evolution-webhook/index.ts` linhas 488-522** (`findOrCreateThread`): filtra por `primary_endpoint_id = endpointId`. Como a thread histórica da Viagi aponta para o endpoint Twilio, o webhook nunca encontra e sempre cria thread nova.
- **Divisor "Número alterado"**: existe apenas como renderer em `src/pages/messages/MessagesList.tsx` (linhas ~683 e ~1991-2004). Não há helper de "trocar número" — o divisor aparece sozinho quando o `endpoint_id` da mensagem N difere do da N-1 na mesma thread. Portanto não é preciso inserir mensagem de sistema; basta que a nova mensagem inbound seja inserida na thread histórica com o `endpoint_id` Evolution.
- **Twilio/Meta webhooks** aplicam o mesmo filtro por `primary_endpoint_id`, o que significa que a regra "1 thread por número" é o padrão atual. A mudança será exclusiva do Evolution (o pedido é explicitamente para migração de provider, não para unificar todo o comportamento inbound do CRM).

## Mudança única — `evolution-webhook/index.ts` `findOrCreateThread`

Substituir a busca escopada por endpoint por uma busca em duas camadas:

1. **Match preferencial** (comportamento atual): thread `(org, contact, channel='whatsapp', primary_endpoint_id = endpointId Evolution)`. Cobre o caso já-migrado / conversas Evolution puras.
2. **Match de migração** (novo): se não achou, procurar a thread WhatsApp mais recente `(org, contact, channel='whatsapp')` **ignorando `primary_endpoint_id`**, ordenada por `last_message_at desc, created_at desc`. Se encontrar:
   - `UPDATE message_threads SET primary_endpoint_id = <endpoint Evolution>, whatsapp_last_inbound_at = <ts>, last_inbound_at = <ts>` para a thread encontrada.
   - Retornar o `id` dessa thread.
3. **Fallback**: se nenhuma thread WhatsApp existir para o contato, criar uma nova como hoje.

Nada mais muda: a inserção da mensagem inbound (linhas ~940-960) já usa o `endpoint_id` Evolution, então o divisor visual "Número alterado: 5098 → 8439" aparece automaticamente entre a última mensagem Twilio e a primeira mensagem Evolution.

## Outbound

Nenhuma alteração necessária. `dispatchWhatsAppSend` já resolve pelo `message_threads.primary_endpoint_id` — como o passo 2 acima atualizou o campo, o próximo envio pelo Composer sai naturalmente pela Evolution, com `endpoint_id` Evolution persistido apenas na mensagem nova. Mensagens antigas permanecem intocadas.

## Segurança / guardas (já cobertas, apenas confirmar no código)

- Endpoint Evolution resolvido a partir do `instance_name` recebido no webhook → garante mesma organização.
- Contato localizado por normalização BR já existente (`normalizePhoneBR`) dentro da mesma org → impossibilita cross-tenant.
- Feature flag `evolution_api_enabled` continua bloqueando execução no topo do handler.
- A troca só é disparada em inbound real (dentro do fluxo `MESSAGES_UPSERT`), nunca em callback de status.

## Restrições respeitadas

- Sem alterar Meta ou Twilio.
- Sem tocar `endpoint_id` de mensagens históricas.
- Sem apagar/copiar histórico.
- Sem criar helper paralelo (reaproveita o divisor já renderizado em `MessagesList.tsx`).
- Escopo cirúrgico: 1 função (`findOrCreateThread`) em 1 arquivo.

## Validação (cenário Junior Teste `5511964298621` via `dev-int` / `5511936198439`)

Executar via SQL/logs, sem novo código de teste:

1. `SELECT count(*) FROM message_threads WHERE contact_id = <junior>` — antes.
2. Enviar mensagem real do celular `5511964298621` para o número Evolution.
3. Repetir contagem — deve permanecer igual.
4. `SELECT id, primary_endpoint_id FROM message_threads WHERE contact_id = <junior>` — `primary_endpoint_id` migrou para o endpoint Evolution da Viagi.
5. Últimas 5 linhas de `messages` da thread: mostrar histórico Twilio + a nova linha inbound Evolution com `endpoint_id` diferente.
6. Abrir `/messages` na thread: confirmar divisor "📞 Número alterado: 5098 → 8439" entre o bloco Twilio e a nova mensagem.
7. Responder pelo Composer: nova outbound persistida na mesma thread, `endpoint_id` Evolution, status `sent → delivered → read` via callbacks já implementados na Fase 6.

## Entrega final (após execução)

Relatório curto no chat com: thread_id antes/depois (igual), `primary_endpoint_id` antes/depois, contagem de threads do contato antes/depois (igual), ID da mensagem inbound, ID da mensagem outbound, screenshot/print do divisor. Sem novo arquivo de auditoria — atualização em `docs/integrations/evolution-api/UX_FINAL_AUDIT.md` se você pedir.