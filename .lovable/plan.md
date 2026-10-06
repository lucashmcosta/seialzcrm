# Fase 0 controlada — Edição de mensagem via Evolution (Vultr)

Objetivo: obter evidência real para a edição de mensagens. Nesta fase não haverá migration, edge function nova nem UI. A única escrita é o envio e a edição de mensagens de teste.

## Pré-requisitos (preciso de você)
- Número de destino de teste (um celular seu), que vai receber e mostrar a edição.
- Instância a usar: proponho a Evolution 7020 da Central (`3ed219e0…`), que já está conectada. Você também pode indicar outra.
- O teste é feito por uma função temporária só de diagnóstico, porque as chaves da Vultr ficam no servidor e não no meu ambiente. Ela fica restrita a admin, só faz GET de versão/webhook, sendText e updateMessage, e é removida no fim. Se preferir não publicar nada, a alternativa é você rodar os comandos curl que eu entregar no servidor da Vultr.

## Passos
1. **Versão:** `GET /` na Vultr para registrar `version`, `clientName` e a versão do WhatsApp Web.
2. **Webhook:** `GET /webhook/find/{instance}` para conferir se `MESSAGES_EDITED` está na lista `events`. Não altero a configuração. Se não estiver, reporto e peço autorização antes de incluir.
3. **Envio A:** enviar a mensagem de texto "Teste edição A" pelo fluxo normal `evolution-whatsapp-send`, numa conversa do número de teste. Registrar `key.id`, `remoteJid`, `messages.whatsapp_message_sid` e `metadata.evolution` bruto.
4. **Edição A (imediata):** `POST /chat/updateMessage/{instance}` com `{number, key:{remoteJid, fromMe:true, id}, text}`. Capturar o request e a response exatos e verificar se o ID original se mantém.
5. **Webhook:** consultar `integration_inbound_events` e os logs do `evolution-webhook` na janela do teste. Classificar o que chegou: `messages.edited`, `messages.upsert` (`protocolMessage`/`editedMessage`) e/ou `messages.update`, com o payload bruto.
6. **Comportamento no WhatsApp:** você confirma o que aparece no celular (texto novo, selo "Editada").
7. **Limite de tempo:** a partir do Envio A, nova tentativa de edição em intervalos de 10, 14, 16, 20 e 30 min, e depois uma mensagem mais antiga (horas). Registro o primeiro intervalo recusado e como a recusa aparece: erro na response ou sucesso silencioso sem efeito no celular.
8. **Localização da original:** mostrar o campo do evento que aponta para o ID original e confirmar que ele bate com `whatsapp_message_sid` (filtrado também por `organization_id` e `endpoint_id`).
9. **Triggers:** listar via `pg_trigger` as triggers de UPDATE em `messages` que reagem a `content` (sanitize, inteligência, `last_message_*`, notificações, outbox), só lendo.
10. **Limpeza:** remover a função temporária, se usada. As mensagens de teste ficam no histórico como evidência, a menos que você peça outra coisa.

## Entrega
- Versão confirmada.
- Endpoint e payload comprovados.
- Limite de tempo observado.
- Payload real do webhook.
- Se `MESSAGES_EDITED` está habilitado.
- Como localizar a original sem ambiguidade.
- Triggers que disparam no UPDATE de `content`.

## Fora do escopo
Meta e Twilio, migrations, UI e suporte genérico.
