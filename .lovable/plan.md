## Diagnóstico do evento 7568163063

**Extras do Sentry (handled warning — hardening funcionou):**
- `audio_error_code: 4` → `MEDIA_ERR_SRC_NOT_SUPPORTED`
- `audio_network_state: 3` (`NETWORK_NO_SOURCE`), `audio_ready_state: 0`
- `src_host: qvmtzfvkhkhkhdpclzua.supabase.co`, `proxied: false`
- Chrome reporta `can_play_audio_ogg_opus: "probably"` → suporte ao codec existe
- `media_type: audio`, `component: AudioMessagePlayer`

**Mensagem:** `48da5f6c-4a05-40a6-9394-d5e4aa45f4b6` — outbound, gravada no CRM, arquivo `1782140110039-2dl8tb.ogg`.

**O que o servidor entrega (verificado via curl):**
- `HTTP 200`, `content-type: audio/ogg`, 103 KB, magic bytes `OggS … OpusHead` corretos.

**O que o ffmpeg diz sobre o arquivo:**
```
[ogg] Packet processing failed: Invalid data found when processing input
[ogg] Error during demuxing
```
Testei mais 4 áudios outbound recentes do mesmo dia → **todos apresentam o mesmo erro de demux**. Não é um arquivo específico corrompido — **todo áudio outbound gravado pelo CRM está sendo gerado fora do padrão OGG/Opus**.

**Causa raiz confirmada no código (`src/components/whatsapp/AudioRecorder.tsx`):**
1. Linhas 57‑73: usa `opus-media-recorder` (polyfill JS) para produzir OGG/Opus. O polyfill gera um stream "good enough" — WhatsApp e a maioria dos browsers aceitam, mas o container não é estritamente conforme (faltam/erram páginas após `OpusHead`).
2. Linhas 67‑73 (fallback nativo): se o polyfill falha, usa `MediaRecorder` nativo que no Chrome/Mac normalmente devolve **WebM/Opus**.
3. Linha 87: independentemente do que o recorder produziu, embrulha os chunks em `new Blob(..., { type: 'audio/ogg;codecs=opus' })` — ou seja, **bytes WebM podem ser rotulados como OGG** no caminho fallback, gerando arquivos definitivamente quebrados.

Chrome 145 é mais rigoroso que versões anteriores e ocasionalmente rejeita esses arquivos com `code=4` em vez de tentar tocar.

## Resposta às perguntas em aberto

**O hardening resolve?** Resolve o sintoma para o usuário (mostra estado de erro + download em vez de quebrar) e elimina o `unhandledrejection` no Sentry. Mas **não resolve a causa**: os arquivos `.ogg` outbound continuam tecnicamente inválidos, o que vai gerar ruído contínuo de warnings handled e, eventualmente, perda de funcionalidade de áudio no WhatsApp se a Meta apertar a validação.

**Precisa de correção no ingestor/proxy/MIME?** O proxy/MIME estão corretos. O problema está **no ingestor outbound (o próprio recorder no browser)**.

## Plano de correção definitiva

### 1. Saneamento do `AudioRecorder.tsx` (frontend)
- Remover o `Blob({ type: 'audio/ogg;codecs=opus' })` hardcoded no `onstop` (linha 87). Usar `recorder.mimeType` real (o que o recorder de fato produziu).
- Padronizar a extensão e o `content-type` do upload com o `mimeType` real:
  - Polyfill produziu `audio/ogg;codecs=opus` → upload `.ogg`
  - Fallback nativo produziu `audio/webm;codecs=opus` → upload `.webm`
- Garantir que o nome do arquivo e o `media_type` no insert da mensagem refletem isso.

### 2. Re-encode server-side para o caminho WhatsApp outbound (Railway/edge)
- Antes de enviar para Twilio/Meta, passar o arquivo recém-uploadado por um conversor (`ffmpeg -i in -c:a libopus -f ogg out.ogg`) para garantir um OGG/Opus 100% conforme.
- Sobrescrever o objeto no Storage ou salvar a versão "clean" e atualizar `media_urls`.
- Isso resolve tanto o playback no CRM quanto a entrega futura para a Meta Cloud (que está mais estrita que o sandbox Twilio).

### 3. Backfill opcional (decidir depois de 1 + 2)
- Job único que percorre os áudios outbound corrompidos dos últimos N dias e re-encoda via ffmpeg.
- Custo baixo, melhora UX de reproduções históricas.

### 4. Validação
- Após (1): gravar áudio no CRM, baixar do Storage, rodar `ffmpeg -i ... -f null -` → zero erros de demux.
- Após (2): mesmo teste no arquivo entregue ao WhatsApp + verificar status `delivered/read`.
- Monitorar Sentry 24‑48h: warning "Audio playback failed" com `audio_error_code: 4` deve cair para próximo de zero.

## Escopo desta entrega (próximo build mode)

Só o **item 1** (frontend recorder). É o ponto cirúrgico que para de gerar novos arquivos quebrados e é puramente UI/presentation, alinhado com a regra de não misturar com backend.

Os itens 2 e 3 (Railway/edge re-encode + backfill) viram **follow-up separado** porque mexem em ingestor/worker, fora do escopo do fix de áudio do frontend.

Se confirmar, em build mode eu:
- Edito `src/components/whatsapp/AudioRecorder.tsx` para usar o `mimeType` real do recorder no Blob, no nome do arquivo e no upload.
- Não toco em nenhum outro arquivo.
- Documento o follow-up de re-encode server-side em `.lovable/plan.md`.
