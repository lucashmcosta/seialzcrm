# Auditoria READ-ONLY — Editar mensagem enviada via Evolution (Vultr)

Nada foi alterado. Abaixo: o que foi confirmado no código, o que ainda depende de uma checagem no servidor e a proposta mínima para você aprovar.

## Respostas

**Suporte confirmado?** Parcial. O código já tem o dado necessário para editar (ID da mensagem original). Ainda não existe envio de edição nem tratamento de edição no webhook. Para fechar o diagnóstico no servidor real, faltam 2 chamadas read-only na Vultr (Passo 0).

**Versão na Vultr:** a documentação registra `2.3.7` (`docs/integrations/evolution-api/DISCOVERY.md:57`, `PHASE_1_READINESS.md:73`). Isso foi medido na Fase 0, não agora. [INCERTO] até rodar `GET /` no servidor (Passo 0).

**Endpoint/payload (Evolution v2.x):** `POST /chat/updateMessage/{instance}`. Não existe `/message/edit` na v2.
```text
{ "number": "5511999999999",
  "key": { "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": true, "id": "<wamid original>" },
  "text": "novo texto" }
```
[INCERTO] até confirmar que a rota responde na 2.3.7 da Vultr (Passo 0, usando um ID inexistente para não editar nada).

**Dados que já temos** (`evolution-whatsapp-send/index.ts:569-587`):
- `messages.whatsapp_message_sid` = `key.id` retornado pela Evolution (fallback `messageId`/`id`).
- `metadata.evolution.wamid` e `metadata.evolution.response` (resposta bruta, inclui `key.remoteJid`).
- `messages.endpoint_id` → `communication_endpoints.sender_sid` = nome da instância.
- `direction`, `media_type`, `sent_at`.
Isso basta para montar o `key` da edição. Mensagens enviadas pelo celular (fromMe, entram pelo webhook) também gravam `whatsapp_message_sid` (`evolution-webhook/index.ts:1185, 1341`).

**Limitações reais (regra do WhatsApp/Baileys):**
- Só `fromMe`.
- Só texto (legenda de mídia não é suportada pela rota de forma confiável) [INCERTO].
- Prazo de cerca de 15 minutos após o envio. Depois disso, o WhatsApp ignora a edição sem aviso claro.
- Funciona em mensagens já entregues ou lidas. O destinatário vê "Editada".
- O ID original é preservado. A edição é um novo protocolMessage (tipo MESSAGE_EDIT) que aponta para o ID original. A mensagem original não recebe um ID novo.

## Gaps encontrados

**Webhook** (`evolution-webhook/index.ts`):
- Eventos tratados: `CONNECTION_UPDATE`, `QRCODE_UPDATED`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `MESSAGE_RECEIPT_UPDATE` (linhas 56-66). Não existe `MESSAGES_EDITED`. Se a Evolution enviar esse evento, ele cai como desconhecido.
- `unwrapMessage` (linhas 220-248) não abre `editedMessage` nem `protocolMessage`.
- `MESSAGES_UPDATE` só altera `whatsapp_status` (linhas 1416-1449).
- **Hoje, se alguém editar no celular:** o upsert chega com `protocolMessage`/`editedMessage`. O texto não é extraído, então a mensagem original no Seialz fica com o texto antigo. [INCERTO] se o evento é descartado ou vira uma bolha vazia/placeholder. Para confirmar, basta consultar `integration_inbound_events` de uma instância Evolution procurando `editedMessage`.

**Banco** (`messages`): não tem `edited_at`. Tem `metadata` (jsonb), `content`, `whatsapp_message_sid`, `direction`, `media_type`, `sent_at` e `endpoint_id`. Não precisa de tabela nova.

## Proposta mínima (aguarda aprovação)

0. **Verificação read-only na Vultr:** `GET /` (versão) e `POST /chat/updateMessage/{instance}` com um ID inexistente. A resposta 400/404 com mensagem de validação prova que a rota existe sem editar nada. Também consultar `integration_inbound_events` para ver como uma edição real chegou.
1. **Migration pequena:** `messages.edited_at timestamptz null`. O histórico fica em `metadata.edits[]` = `{previous_content, edited_at, edited_by_user_id, source: 'seialz'|'whatsapp'}`. A mesma linha é atualizada, sem criar uma segunda mensagem.
2. **Nova edge function `evolution-whatsapp-edit`**, separada do send para não arriscar o envio. Ela:
   - valida JWT e organização;
   - aceita só `direction=outbound`, endpoint `evolution_api` ativo, `media_type` nulo ou texto, `whatsapp_message_sid` presente e `sent_at` com menos de 15 min;
   - chama `/chat/updateMessage`;
   - só então grava `content`, `edited_at` e `metadata.edits`.
   Erros: 409 `edit_window_expired`, 409 `not_editable`, 502 com o corpo da Evolution.
3. **Webhook:** dentro do caminho de upsert, detectar `protocolMessage.type=MESSAGE_EDIT`/`editedMessage`. Localizar a mensagem por `whatsapp_message_sid` = ID original e aplicar a mesma atualização (`source: 'whatsapp'`), sem inserir uma linha nova. Se houver `MESSAGES_EDITED`, ele vai para o mesmo handler.
4. **Web:** ação "Editar" no menu da bolha, visível só quando as cinco condições acima valem (a mesma regra é calculada no client). Mostrar o selo "Editada" quando `edited_at` estiver preenchido.
5. **Mobile:** mesma regra de visibilidade e a mesma função. O selo lê `edited_at`. O app publicado ignora a coluna nova sem quebrar, e nenhuma RPC muda de assinatura.

## Riscos de regressão
- O webhook é o caminho crítico: tratar a edição antes da extração atual, com retorno antecipado, para não alterar o parsing de texto e mídia.
- Triggers em `messages` (UPDATE de `content`): `trigger_sanitize_agent_message`, a reanálise de inteligência e a denormalização `last_message_*`. É preciso conferir se o UPDATE dispara reprocessamento ou notificação indevida.
- Relógio: o prazo de 15 min usa `sent_at`. Se o relógio do servidor for diferente, a edição pode ser recusada pelo WhatsApp sem erro, então tratar a resposta da Evolution como fonte final.
- A mudança é isolada de Meta e Twilio: função nova, condição `provider=evolution_api` só no servidor e capacidade derivada do endpoint, sem `if` de provider espalhado no Composer.
- Não usar overload de RPC (regra do app nativo).
