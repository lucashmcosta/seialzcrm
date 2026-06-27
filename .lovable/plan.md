
# Remover texto "[Áudio]" abaixo do player de áudio

## Causa
`meta-whatsapp-send` salva `content="[Áudio]"` quando não há caption, e o webhook faz o mesmo no inbound. A timeline (`InboxConversationTimeline.tsx`) renderiza esse texto porque `isAudioOnly = media_type === 'audio' && !content` fica `false` quando `content` tem o placeholder.

## Mudança (apenas UI, sem mexer em edge function)

Em `src/components/inbox/InboxConversationTimeline.tsx`:

1. Trocar a regra de `isAudioOnly` (linhas 36 e 122) para considerar áudio sempre como "audio-only" — Meta nem aceita caption em áudio, e visualmente não faz sentido mostrar texto abaixo do player:
   ```
   const isAudioOnly = m.media_type === 'audio';
   ```
2. Para os demais tipos (image/video/document), suprimir a renderização do `content` quando ele for um placeholder gerado pelo backend (`[Imagem]`, `[Vídeo]`, `[Documento]`), preservando captions reais. Linha 200:
   ```
   const isPlaceholder = m.content && /^\[(Áudio|Imagem|Vídeo|Documento|Sticker)\]$/.test(m.content);
   {m.content && !isAudioOnly && !isPlaceholder && (<WhatsAppFormattedText ... />)}
   ```

## Não mexer
- Edge functions (placeholders continuam sendo salvos para alimentar o preview da lista de threads `last_message_content`).
- Twilio.
- `AudioMessagePlayer`, layout do balão (`p-1` continua via `isAudioOnly`).

## Validação
- Áudio outbound/inbound: player sem texto "[Áudio]" abaixo.
- Imagem sem caption: imagem sem texto "[Imagem]" abaixo.
- Imagem com caption: caption aparece normalmente.
- Lista de threads: continua mostrando "[Áudio]"/"[Imagem]" como prévia.
