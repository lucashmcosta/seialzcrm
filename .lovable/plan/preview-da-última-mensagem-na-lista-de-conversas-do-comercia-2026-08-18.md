# Preview da última mensagem na lista de conversas do Comercial

Somente UI + leitura. Nada de envio, rota, thread, backend ou banco.

## O que a auditoria encontrou

- `message_threads` já tem `last_message_id`, `last_message_content` (200 chars), `last_message_direction`, `last_message_at`. Não existe `last_message_type`.
- O trigger `fn_update_thread_last_message` já ignora notas internas e mensagens deletadas, e recalcula em UPDATE/DELETE. Ou seja: `last_message_id` é exatamente a "última mensagem válida" pedida.
- A RPC `rpc_list_message_threads` já devolve `last_message_id` e `last_message_content`, mas o hook `useMessageThreads` descarta o `last_message_id` no mapeamento.
- Tipo de mídia mora em `messages.media_type` (`audio`, `image`, `document`, `video`, `sticker`; texto = null). O `content` dessas mensagens já vem com marcador `[Áudio]`, `[Imagem]`, etc., mas o dado confiável é `media_type`.
- "Você:" é viável: `messages.sender_user_id` identifica quem enviou; comparando com o usuário atual dá para prefixar sem inventar.
- Já existe o padrão de resolução em lote para a lista visível: `useThreadBadgeEndpoints` (uma query em `messages` por `last_message_id`). O preview segue o mesmo padrão — nenhuma query por thread.

## Implementação

1. `src/hooks/useMessageThreads.ts` — expor `last_message_id` no tipo `ChatThread` e no mapeamento (campo já vem da RPC, inclusive no caminho de realtime `rpc_get_message_threads_by_ids`). Nenhuma mudança de ordenação ou de filtro.
2. Novo `src/lib/messagePreview.ts` — formatação pura:
   - `audio` → `🎤 Áudio`; `image` → `📷 Foto`; `video` → `🎥 Vídeo`; `document` → `📄 Documento`; `sticker` → `Sticker`.
   - texto → conteúdo em uma linha (colapsa quebras/espaços); vazio/desconhecido → `Mensagem`.
   - prefixo `Você: ` apenas quando a última mensagem é outbound e `sender_user_id` é o usuário atual.
   - thread sem mensagem → sem linha de preview.
3. Novo `src/hooks/messages/useThreadLastMessagePreviews.ts` — recebe os `last_message_id` das threads visíveis, faz **uma** query em `messages` (`id, content, media_type, direction, sender_user_id`) e devolve `Record<threadId, preview>`. Chave do efeito derivada dos ids, então quando o realtime atualiza `last_message_id`/`last_message_content` da thread o preview refaz sozinho, sem reload.
4. `src/pages/messages/MessagesList.tsx` — passar o preview para `ChatListItem` e renderizar a nova linha entre o nome e a linha de meta (status · número · responsável): `text-xs text-muted-foreground truncate` em uma única linha, sem alterar o horário à direita. Fallback imediato: enquanto a query em lote não responde, usa `last_message_content` da própria thread (já disponível), então não há “pisca vazio”.

## Validação

Typecheck e checagem visual na lista: inbound texto, outbound texto, áudio, imagem, documento, texto longo (truncate), mensagem nova via realtime e thread sem mensagem.
