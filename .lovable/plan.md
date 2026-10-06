# Fase 0 controlada — Edição de mensagem via Evolution (Vultr)

Sem migration, sem edge function, sem UI. As chamadas são feitas direto na Vultr via curl, a partir do meu ambiente, com as credenciais existentes (`EVOLUTION_BASE_URL`/`EVOLUTION_GLOBAL_API_KEY`). A chave nunca é impressa e as saídas passam por redação.

Instância: Evolution 7020 da Central. Destino: o número de teste que você informar.

## Passos
1. `GET /` para ver a versão da Evolution e a versão do WhatsApp Web.
2. `GET /webhook/find/{instance}` para ver a configuração atual. **Se `MESSAGES_EDITED` não estiver em `events`, eu paro aqui e te informo.**
3. Envio pelo fluxo normal `evolution-whatsapp-send`, para que a mensagem fique em `messages` com `whatsapp_message_sid` e `metadata.evolution`.
   - Em T0 saem 5 mensagens de teste independentes: A (editada logo), B (~10 min), C (~15 min), D (~20 min) e E (~30 min).
   - Para o caso "antiga", uso uma mensagem de texto outbound já existente nesta conversa, com mais de 1h. Se não houver, envio uma F e edito horas depois.
4. Para cada mensagem, uma única chamada `POST /chat/updateMessage/{instance}`, na idade definida. Registro o request (sem a chave) e a response exatos.
5. Depois de cada edição, consulto `integration_inbound_events` e os logs do `evolution-webhook` para pegar o payload bruto e o tipo do evento (`messages.edited`, `upsert` com `protocolMessage`/`editedMessage`, `update`).
6. Vínculo: confiro qual campo do evento aponta para o ID original e se ele bate com `messages.whatsapp_message_sid` da mesma organização e do mesmo endpoint.
7. Você confirma no celular o que apareceu: o texto novo, o selo "Editada" ou nada.
8. Leitura de `pg_trigger` em `messages` para listar as triggers que reagem a UPDATE de `content`.

## Entrega
Versão, webhook atual, request e response reais, payload do webhook, vínculo com o ID original, comportamento no WhatsApp, janela comprovada e triggers.
