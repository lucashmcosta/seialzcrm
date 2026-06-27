
# Suporte a mídia na Meta WhatsApp Cloud API

Escopo: image, audio, document, video (sticker fica como placeholder). Sem mudanças de schema, sem mexer em Twilio, sem mexer na UI.

## 1. Outbound — `supabase/functions/meta-whatsapp-send/index.ts`

Remover a guarda `media_not_supported` e implementar fluxo de mídia.

### 1.1 Detecção
Após validar 24h window e antes do `buildTextPayload`:
- Normalizar `mediaUrls`: se vier `mediaUrl` único, transformar em array.
- Se houver mídia: ramificar para `sendMediaMessage`. Senão, manter fluxo texto atual.
- Validar `mediaType ∈ {image, audio, document, video}`. Sticker → 400 `sticker_not_supported_yet` (preservar metadata).

### 1.2 Upload para Graph
Nova função `uploadMediaToGraph(fileUrl, mimeType, phoneNumberId, accessToken)`:

```text
1. fetch(fileUrl) → ArrayBuffer (URL pública do bucket whatsapp-media)
2. Inferir mimeType:
   - prioridade: payload.mimeType > response.headers['content-type'] > inferir por extensão
   - fallback por mediaType: audio→audio/ogg, image→image/jpeg, video→video/mp4, document→application/pdf
3. Montar FormData:
   - messaging_product: "whatsapp"
   - type: <mimeType>
   - file: Blob([buffer], { type: mimeType }), filename
4. POST https://graph.facebook.com/v21.0/{phone_number_id}/media
   Authorization: Bearer {access_token}
5. Retornar { media_id, mime_type, size }
```

Tratamento de erro: capturar `error.message` do Graph, retornar 502 `graph_upload_failed` com detalhes (sem vazar token).

### 1.3 Envio da mensagem
Após obter `media_id`, montar payload por tipo:

```text
image    → { type:"image",    image:    { id, caption? } }
audio    → { type:"audio",    audio:    { id } }                  // sem caption
video    → { type:"video",    video:    { id, caption? } }
document → { type:"document", document: { id, caption?, filename? } }
```

`caption` = `message` (se não-vazio). `filename` = payload.filename ou derivado da URL, fallback "document".

POST para `/{phone_number_id}/messages` → extrair `wamid`.

### 1.4 Persistência em `messages`
Após sucesso Graph:
- `content`: `message` se houver, senão placeholder por tipo (`[Áudio]`, `[Imagem]`, `[Vídeo]`, `[Documento]`).
- `media_urls`: `[urlPublica]` (a URL já existente no Storage, **não** a do Graph).
- `media_type`: `image|audio|video|document`.
- `whatsapp_message_sid`: `wamid`.
- `whatsapp_status`: `sent`.
- `metadata.meta_cloud`: `{ phone_number_id, media_id, mime_type, filename?, caption? }`.

Manter `direction='outbound'`, `sent_by_app_user_id`, `thread_id`, `contact_id`, `organization_id` como no fluxo de texto.

### 1.5 Erros e ordem
- Inserir `messages` somente **após** Graph aceitar (mesmo padrão do envio de texto atual), para não poluir histórico em caso de falha de upload.
- Em falha de upload Graph: retornar 502 estruturado, não inserir mensagem.
- Em falha de envio (upload OK mas /messages 4xx): inserir com `whatsapp_status='failed'` + `metadata.meta_cloud.error`.

## 2. Inbound — `supabase/functions/meta-whatsapp-webhook/index.ts`

### 2.1 Detecção de mídia
No loop de `messages[]`, após classificar `text/button/interactive`, adicionar branch para `image|audio|video|document|sticker`:

```text
const mediaKinds = ['image','audio','video','document','sticker'];
const kind = mediaKinds.find(k => msg[k]);
if (kind) { ...handleInboundMedia(msg, kind)... }
```

### 2.2 Download Meta → Storage
Nova função `downloadAndStoreInboundMedia(media_id, mime_type, accessToken, organizationId)`:

```text
1. GET https://graph.facebook.com/v21.0/{media_id}
   Authorization: Bearer {access_token}
   → { url, mime_type, sha256, file_size }
2. GET {url} com Authorization: Bearer {access_token} → ArrayBuffer
3. Inferir extensão de mime_type (audio/ogg→.ogg, image/jpeg→.jpg, etc).
4. path = `${organizationId}/meta-inbound/${media_id}.${ext}`
5. supabase.storage.from('whatsapp-media').upload(path, buffer, { contentType: mime_type, upsert: true })
6. getPublicUrl(path) → publicUrl
7. return { publicUrl, mime_type, sha256, file_size }
```

Erros: capturar e logar; se falhar, persistir mensagem **sem** `media_urls` mas com `metadata.meta_cloud.media_download_error` para diagnóstico.

### 2.3 Persistência
- `media_urls`: `[publicUrl]` (vazio em caso de erro de download).
- `media_type`: `image|audio|video|document|sticker`.
- `content`:
  - image: `caption || '[Imagem]'`
  - video: `caption || '[Vídeo]'`
  - document: `caption || filename || '[Documento]'`
  - audio: `'[Áudio]'`
  - sticker: `'[Sticker]'`
- `metadata.meta_cloud`: `{ media_id, mime_type, sha256, filename?, caption?, raw: msg[kind] }`.

Sticker: baixar e armazenar igual aos outros, mas marcar `media_type='sticker'`. Se a UI não renderizar, ainda fica acessível pelo link.

## 3. Dispatcher e Composer
Sem mudanças. `dispatchWhatsAppSend.ts` já repassa `mediaUrl`/`mediaType` corretamente; o composer já faz upload para o bucket. A mudança fica isolada nas duas Edge Functions Meta.

## 4. Não mexer
- `twilio-whatsapp-send`, `twilio-whatsapp-webhook`
- Schema da tabela `messages` (colunas já existem)
- Bucket `whatsapp-media` (já existe, já é usado por Twilio)
- `InboxConversationTimeline.tsx`, `WhatsAppChat.tsx` (já leem `media_urls[]` + `media_type`)

## 5. Validação após deploy
Checklist obrigatório:
1. Texto Meta ainda envia OK
2. Texto Meta ainda recebe OK
3. Áudio outbound Meta chega no celular + DB com `media_type='audio'`
4. Imagem outbound Meta + caption
5. Documento outbound Meta + filename
6. Áudio inbound Meta aparece com player
7. Imagem inbound Meta renderiza
8. Documento inbound Meta abre via link
9. Twilio outbound/inbound intactos

Logs a checar em `meta-whatsapp-send` e `meta-whatsapp-webhook` no Supabase.

## Detalhes técnicos

- API version Graph: `v21.0` (mesma já usada nas chamadas existentes da função; se outra versão estiver hardcoded no arquivo, manter consistência).
- Token: já lido das credenciais do número Meta como no envio de texto atual.
- Limite de tamanho Meta: image 5MB, audio 16MB, video 16MB, document 100MB. Não vamos pré-validar — repassar erro do Graph se exceder.
- `mimeType` no payload do dispatcher: hoje não é passado explicitamente. Vamos inferir por `mediaType` + extensão da URL; pode ser refinado depois passando `mimeType` direto do composer se necessário.
