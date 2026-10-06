# Publicar V1 de edição de mensagem Evolution (Central)

## Validação no banco (concluída, somente leitura)
Mensagem `9435304a-2048-4d78-9a47-710749e87b01` (thread `9c158663…`, endpoint Evolution 7020 `3ed219e0…`):
- `edited_at` = 2026-10-06 20:46:37 UTC (enviada 20:38:50, editada aos 7m47, dentro de 15 min)
- `edited_by_user_id` = `400ab2e2…` (Junior Domingos) = `sender_user_id`
- `edit_count` = 1
- `message_edit_history` `a812757d…`: org Central, provider `evolution_api`, `provider_status='submitted'`, `edit_count_after=1`
- `previous_content` "ueaa" → `new_content` "uepa" = `messages.content` atual
- `provider_response` gravado; `protocolMessage.key.id` = ID original; chave da edição `3EB061926873A7CEC32A30`
- `whatsapp_message_sid` = `metadata.evolution.wamid` = `response.key.id` = `3EB0C33D4CF7BFA1FF9D57` (inalterado)
- Flag `evolution_message_edit_v1`: ligada, somente org `40ae935c…`

Verificação de tipos: sem erros.

## Ao aprovar
1. Publicar o app (frontend) — edge function já está publicada.
2. Não alterar a flag (continua só Central).
3. Entregar relatório final.
