# Auditoria do pipeline de gravação de áudio — causa-raiz encontrada e provada

## Resposta curta

O container OGG **está conforme a especificação em tudo, exceto um detalhe**: o encoder anexa um **pacote de tamanho zero** no fim do stream (lacing value `0` no fim da segment table da última página). Um pacote Opus vazio é inválido pela RFC 6716 — é isso que faz o ffmpeg dizer `Packet processing failed: Invalid data found` e faz a Meta reclassificar o arquivo como `application/octet-stream` (erro 131053).

**Não é necessário recodificar.** Remover esse pacote vazio e recalcular o CRC da última página resolve — verificado nos 4 áudios reais que falharam hoje.

## Como isso foi comprovado (4 arquivos reais que falharam com 131053)

Baixados de `whatsapp-media` e dissecados byte a byte:

| arquivo | páginas | serial | BOS/OpusHead | OpusTags | EOS | CRC | granulepos | último pacote |
|---|---|---|---|---|---|---|---|---|
| omiffq | 54 | único | ok (off 28) | ok (off 75) | ok | todas válidas | monotônico | **0 byte** |
| lmb9fl | 61 | único | ok | ok | ok | válidas | monotônico | **0 byte** |
| xpjbwg | 52 | único | ok | ok | ok | válidas | monotônico | **0 byte** |
| puhjog | 13 | único | ok | ok | ok | válidas | monotônico | **0 byte** |

Ou seja: sem stream encadeado, sem BOS duplicado, sem salto de page sequence, sem CRC quebrado, sem truncamento (offset final == tamanho do arquivo), 48 kHz mono. O único defeito é a segment table da última página terminar em `0`:

```text
xpjbwg  última página: nseg=3  segs=[65, 65, 0]   -> pacote #1743 com 0 byte
puhjog  última página: nseg=3  segs=[72, 72, 0]   -> pacote #331  com 0 byte
omiffq  última página: nseg=58 segs=[..,59,59,0]
lmb9fl  última página: nseg=22 segs=[..,64,64,0]
```

Correção aplicada em memória (remover o último lacing `0`, `nseg -= 1`, recalcular CRC32 Ogg da página) e revalidação nos 4 arquivos:

```text
ffmpeg -v error -i <arquivo corrigido> -f null -   ->  NENHUM erro (todos os 4)
```

Nenhum byte de áudio foi tocado — só o cabeçalho da última página.

## Pipeline auditado

- **Biblioteca**: `opus-media-recorder@0.8.0` (polyfill WASM), caminho preferencial `audio/ogg;codecs=opus`; worker UMD e WASM servidos do bundle local (`src/components/whatsapp/AudioRecorder.tsx`).
- **Fallback nativo** (`pickNativeMime`): `audio/ogg;codecs=opus` → `audio/mp4` → `audio/webm;codecs=opus`. MP4/WebM nunca são enviados como áudio (viram documento).
- **Captura**: `getUserMedia({ echoCancellation, noiseSuppression, sampleRate: 48000 })`; a lib usa `ScriptProcessor(4096)`, `sampleRate = AudioContext.sampleRate`, `channelCount = track.getSettings().channelCount || 1`.
- **Encoder** (`OggOpusEncoder.js`): Speex resampler (qualidade 6) para 48 kHz, `opus_encoder_create(48000, ch, OPUS_APPLICATION_AUDIO)`, frame de 20 ms (960 amostras), bitrate não configurado (`audioBitsPerSecond` não é passado → default do libopus; medido ~48–52 kbps). Confere com o observado: cfg15/cfg31, 20 ms, mono, 48 kHz.
- **Montagem do Blob**: sem `timeslice`, então há um único `dataavailable` (`lastEncodedData`) no `stop()`; `new Blob(chunks, { type: mediaRecorder.mimeType })`. Não há remontagem nem relabel de container (`audioBlobToFile.ts` só escolhe a extensão pelo MIME real).
- **Origem do pacote vazio**: `_OpusEncoder.close()` chama `encode()` com um buffer de padding (`new Float32Array(BUFFER_LENGTH - inputBufferIndex/channelCount)`) e em seguida `Module.destroy(container)`; o container WASM finaliza o stream emitindo um frame de comprimento zero antes de fechar a página EOS. Bug da biblioteca, não da nossa configuração — nenhuma opção de `OpusMediaRecorder` evita isso.
- **Validação atual** (`validateOggOpus`) só checa `OggS` + `OpusHead` nos primeiros 4 KB, portanto não detecta o defeito, que está no fim do arquivo.

## Por que só apareceu agora

O arquivo sempre teve o pacote vazio. Decoders tolerantes (navegador, WhatsApp até 26/08) ignoravam. O endurecimento do parser da Meta em ~26/08 22h UTC passou a rejeitar o stream inteiro.

## Correção proposta (sem ffmpeg, sem recodificação)

1. Novo utilitário `src/lib/sanitizeOggOpus.ts`, puro e sem dependências:
   - varre as páginas Ogg do Blob gravado;
   - se a **última** página terminar com lacing `0`, remove esse valor, decrementa `page_segments` e recalcula o CRC32 Ogg (polinômio `0x04c11db7`, campo zerado antes do cálculo) daquela página;
   - preserva todo o resto do arquivo byte a byte; se não houver defeito, devolve o Blob original.
2. `AudioRecorder.tsx` aplica o sanitizer no `onstop`, antes de `setAudioBlob`.
3. `validateOggOpus` ganha uma checagem de cauda: rejeita o envio se, após o sanitizer, ainda existir pacote de comprimento zero ou a última página não tiver EOS.
4. Telemetria: novo evento `audio_record_ogg_tail_fixed` em `audio_record_events` (mesmo caminho fire-and-forget de `src/lib/audioTelemetry.ts`) para medir a incidência real, e documentação em `docs/operations/audio-telemetry.md`.

Sem `ffmpeg`, sem transcode em produção, sem mudar bitrate/sample rate/canais, sem tocar em roteamento, endpoints ou schema.

## Detalhes técnicos

- Escopo: `src/lib/sanitizeOggOpus.ts` (novo), `src/components/whatsapp/AudioRecorder.tsx`, `src/lib/audioTelemetry.ts`, `docs/operations/audio-telemetry.md`.
- Nenhuma alteração no guard `415 unsupported_audio_mime` de `meta-whatsapp-send`, nem em Edge Functions.
- Não trocamos de biblioteca: `opus-media-recorder` continua produzindo Opus 48 kHz mono válido; só a finalização do container é corrigida.
- Áudios antigos já armazenados continuam defeituosos; um reprocessamento retroativo, se desejado, é decisão separada.

## Validação após implementar

- Gravar no Chrome e no Safari, confirmar que o Blob resultante não tem lacing `0` final e passa `ffmpeg -f null -` sem erro.
- Enviar pelo 7067 (Meta) e confirmar `delivered` sem 131053.
- Acompanhar `audio_record_events` por 48h: `131053 = 0`, `invalid_ogg ≈ 0`, incidência de `ogg_tail_fixed` esperada em ~100% das gravações do polyfill.
