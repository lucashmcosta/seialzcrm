## Homologação real Evolution `dev-int` — loop de verificação e correção

Você envia os 10 tipos do seu celular para o número da instância `dev-int` (Viagi). Eu executo, para cada mensagem, o ciclo abaixo até tudo passar.

### Protocolo por mensagem

1. Consultar `integration_inbound_events` (últimos ~2 min) → confirmar ingestão pelo webhook.
2. Consultar `messages` do thread do contato → validar `content`, `message_type`, `metadata.rich_message`, `metadata.evolution.raw`, `attachment_url`.
3. Se mídia: validar objeto em `storage.objects` (bucket, path `<org>/evolution-inbound/<waMessageId>.<ext>`, mime).
4. Abrir `/messages` e `/inbox` do thread → validar render (ContactsCard, LocationCard, ReactionContent, FlowReplyCard, áudio player, quoted preview).
5. Falha → ler logs de `evolution-webhook`, ajustar `supabase/functions/evolution-webhook/index.ts` ou `_shared/evolution/vcard.ts` ou `src/components/messages/MetaRichMessageContent.tsx`, deploy da função, pedir reenvio, revalidar.

### Ordem sugerida de envio (pode enviar todos de uma vez)

1. Contato único (`contactMessage`)
2. Múltiplos contatos (`contactsArrayMessage`)
3. Localização estática
4. Live location
5. Sticker
6. Imagem (com e sem caption se possível)
7. Áudio/PTT
8. Vídeo
9. Documento (PDF)
10. Reply/quoted em cima de qualquer mensagem anterior

### Documentação

Ao final, `docs/integrations/evolution-api/MEDIA_AND_VCARD_AUDIT.md` seção 6 recebe: JSON abreviado do `metadata.rich_message` real de cada tipo, path de storage quando aplicável, e status final (OK / corrigido / limitação).

### Entrega final

Tabela objetiva: tipo → testado / falha encontrada / correção aplicada / resultado final / limitação restante.

### Como sinalizar

Responda "enviei" (ou liste os tipos que já foram) e eu inicio a verificação imediatamente. Se quiser, envie em lotes — cada lote dispara um ciclo completo de verificação e correção.