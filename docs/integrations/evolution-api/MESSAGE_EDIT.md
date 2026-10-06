# Edição de mensagem enviada via Evolution — V1 piloto

Status: V1 piloto, flag `evolution_message_edit_v1` (somente Central Trabalhista `40ae935c…`).

## Evidência (Fase 0, 2026-10-06, Evolution 2.3.7 / WA Web 2.3000.1049446488, instância 7020)
- `POST /chat/updateMessage/{instance}` com `{number, key:{remoteJid, fromMe:true, id}, text}` edita a mensagem; `key.id` = `messages.whatsapp_message_sid` = `metadata.evolution.response.key.id`.
- Resposta: `200`, `message.protocolMessage.type = MESSAGE_EDIT`, `protocolMessage.key.id` = ID original, `status: PENDING`, nova `key.id` própria da edição.
- **A resposta 200/PENDING NÃO confirma aplicação**: J4 (20m01), J5 (30m01), J6 (60m01) receberam 200 idênticos e o WhatsApp não aplicou.
- Janela real: aplicou em 16m01, não aplicou em 20m01.
- Nenhum webhook chega para edições feitas por nós, com ou sem `MESSAGES_EDITED`.

## Regras (autoridade: Edge Function `evolution-edit-message`)
- Só o autor (`sender_user_id` = usuário autenticado, `sender_type='user'`); admin não edita de outro usuário.
- Só texto outbound, não apagada, não nota interna, sem template/mídia/erro, com `whatsapp_message_sid`.
- Endpoint com provider `evolution_api`. Meta/Twilio: `409 provider_not_supported`.
- Janela: 15 min a partir de `sent_at` (margem sob o mínimo comprovado de 16 min).
- `remoteJid` precisa ser `<dígitos>@s.whatsapp.net`, bater com `metadata.evolution.to`, `key.id` = sid, `fromMe=true`; senão `409 remote_jid_invalid` (fail-closed).
- Instância do endpoint deve bater com `metadata.evolution.instance_name` (`409 instance_mismatch`).

## Contrato
`POST functions/v1/evolution-edit-message` (JWT do usuário) — body `{ message_id: uuid, new_text: string(1..4096) }`.
Sucesso `200 { message_id, content, edited_at, edit_count, provider_status: "submitted" }`.
Erros: `400 invalid_*`, `401 unauthorized`, `403 forbidden|feature_disabled|not_author`, `404 not_found`,
`409 not_editable|edit_window_expired|content_unchanged|provider_not_supported|remote_jid_invalid|instance_mismatch|concurrent_edit`,
`502 provider_rejected|provider_unreachable`, `500 persist_failed`.

## Persistência
- `messages.edited_at`, `edited_by_user_id`, `edit_count`.
- `message_edit_history` (somente service_role; RLS sem policies; sem leitura pelo frontend). Guarda `previous_content`, `new_content`, `provider_response`, `provider_status='submitted'`.
- `rpc_apply_message_edit_v1` (service_role): `FOR UPDATE` + checagem de `content` e `edit_count` esperados (`concurrent_edit`) + insert do histórico + update da mensagem na mesma transação.
- Semântica: edição **aceita/submetida**, nunca "entregue". A UI avisa que o WhatsApp pode não aplicar.
- Triggers: só `trg_update_thread_last_message` reage (prévia da conversa). Sem nova activity/notificação/push/IA.

## UI
Comercial e Atendimento usam o mesmo `MessageEditControl` e a mesma flag (`useMessageEditFlag`). Selo "Editada" no rodapé; mobile web exibe só o selo.

## [TODO]
- Sincronizar edições feitas direto no celular/WhatsApp Web (não chegam pelos eventos atuais).
- Botão no app nativo (contrato acima).
- Leitura de histórico na UI exigirá regra equivalente à visibilidade da thread.
