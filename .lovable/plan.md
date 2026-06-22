## Causa imediata

`NotSupportedError` (DOMException 9) ocorre quando `HTMLAudioElement.play()` é chamado sem fonte válida ou com MIME que o navegador não decodifica. Hoje:

- `AudioMessagePlayer` chama `audio.play()` sem `.catch()` → vira `unhandledrejection` no Sentry.
- `CallRecordingPlayer` tem o mesmo padrão.
- Consumidores repassam qualquer item de `media_urls`, inclusive vazio/`null`.

## A. Hardening dos players

### `src/components/whatsapp/AudioMessagePlayer.tsx`
- `togglePlay`: `await audio.play()` em `try/catch`. No catch: `hasError=true`, `isPlaying=false`, cancela `rAF`, dispara logger handled (C). Não relança.
- `onError` do `<audio>`: também seta `isPlaying=false` e cancela `rAF`; dispara o mesmo logger.
- Guard de `src`: se falsy, não parseável por `new URL(src)` ou scheme não-http(s), renderiza só "Não foi possível carregar este áudio." e não monta `<audio>`/botão.
- Aviso de erro substitui o waveform (sem botão fantasma).

### `src/components/calls/CallRecordingPlayer.tsx`
- Mesmo guard de `recordingUrl`.
- Listeners `onerror` no `Audio` setam estado de erro local.
- `play().catch(...)` com mesmo tratamento e logger handled.

## B. Diagnóstico da causa raiz

Via `supabase--read_query`:
1. Amostra de últimos 200 `messages` com `media_type='audio'` ou `media_urls` não vazio: `id, thread_id, media_type, media_urls, content, sent_at, direction, whatsapp_status, error_message`.
2. Contagens: `media_urls` `NULL`/`[]`/com `''`; hosts distintos (`api.twilio.com` vs `media.whatsapp.net` vs Supabase Storage vs outros); sem extensão reconhecida; `audio` com `.oga/.opus`/sem extensão.
3. Conferir a mensagem do Sentry (thread `5efef264-d706-4a78-9108-97518477e7a7`): `media_urls`/`media_type` reais.

Resultado define D.

## C. Logging controlado (handled warning)

`src/lib/audioErrorReport.ts` com `reportAudioFailure(ctx)`:
- `import('@sentry/react')` dinâmico; fallback `console.warn`.
- `Sentry.captureMessage('Audio playback failed', { level: 'warning', extra: ctx })`.
- Contexto:
  - `component`
  - `message_id`, `thread_id` (opcionais)
  - `media_type`
  - `src_present: boolean`
  - `src_host` (só `URL.host`, nunca path/query)
  - `audio_error_code` (`audio.error?.code`)
  - `audio_network_state`, `audio_ready_state`
  - **Testes reais de MIME** (`audio.canPlayType(...)`):
    - `audio/ogg; codecs="opus"`
    - `audio/ogg`
    - `audio/mpeg`
    - `audio/mp4`
    - `audio/wav`
  - `proxied: boolean` (host == projeto Supabase + path inclui `twilio-media-proxy`)
  - `error_name`, `error_message` do catch.

Estender props de `AudioMessagePlayer` com `messageId?`/`threadId?`/`mediaType?`; passá-las em `ContactMessages`, `InboxConversationTimeline`, `WhatsAppChat`, `MessagesList`, `MobileMessagesList`.

## D. Correção estrutural (condicional a B)

- **`media_urls` com `''`/`null`** → corrigir ingestor (Railway/edge function) para não inserir entradas vazias; UI já protegida por A.
- **Twilio expirado/401** → garantir uso de `getProxiedMediaUrl` em todos os pontos (auditar consumidores).
- **WhatsApp `.ogg/opus`** → renderizar com `<source type="audio/ogg">`; expor download fallback no `AudioMessagePlayer` quando `hasError`; se Safari for relevante, abrir tarefa de conversão server-side.
- **Supabase Storage privado** → usar signed URL com TTL adequado.
- **CORS** → ajustar no proxy/origem.

Reporto a causa real após B e proponho fix definitivo (mesmo PR ou follow-up).

## E. Validação

1. Áudio `.mp3` válido → toca.
2. `media_urls=['']` → aviso, sem clique, sem erro Sentry.
3. URL 404 → aviso + warning handled.
4. MIME desconhecido (`.bin`) → idem.
5. WhatsApp `.ogg` → toca; senão, warning com `can_play_audio_ogg_opus` para classificar.
6. `CallRecordingPlayer` inválido → mesmo comportamento.

Aceite:
- Nenhum `unhandledrejection NotSupportedError` `handled:no` no Sentry.
- Estado de erro sempre claro.
- Warning Sentry com contexto suficiente para classificar causa.
- Build OK; sem impacto em UI/CRM além dos players.

## Fora do escopo
- Reescrever pipeline de ingestão.
- Conversão server-side de codec (eventual follow-up).
- Mudanças visuais nos players além do estado de erro.
