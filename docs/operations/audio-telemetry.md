# AudioRecorder Telemetry

Tabela: `public.audio_record_events`

## Eventos
- `audio_record_success` — áudio gravado e enviado com sucesso.
- `audio_record_invalid_ogg` — falha na validação `OggS + OpusHead`.
- `audio_record_fallback_mp4` — polyfill falhou, fallback nativo `audio/mp4`.
- `audio_record_fallback_webm_document` — enviado como documento por ser WebM.
- `audio_record_polyfill_init_error` — `opus-media-recorder` falhou ao inicializar.

Log é fire-and-forget: nunca bloqueia envio, nunca lança.

## Queries

Últimas 24h por evento:
```sql
SELECT event, count(*)
FROM public.audio_record_events
WHERE created_at >= now() - interval '24 hours'
GROUP BY 1
ORDER BY 2 DESC;
```

Por browser (7 dias):
```sql
SELECT browser, event, count(*)
FROM public.audio_record_events
WHERE created_at >= now() - interval '7 days'
GROUP BY 1,2
ORDER BY 1,2;
```

Taxa de fallback por org (7 dias):
```sql
SELECT organization_id,
       count(*) FILTER (WHERE event = 'audio_record_success')                AS ok,
       count(*) FILTER (WHERE event = 'audio_record_invalid_ogg')            AS invalid_ogg,
       count(*) FILTER (WHERE event = 'audio_record_fallback_mp4')           AS fallback_mp4,
       count(*) FILTER (WHERE event = 'audio_record_fallback_webm_document') AS fallback_webm_doc,
       count(*) FILTER (WHERE event = 'audio_record_polyfill_init_error')    AS polyfill_error
FROM public.audio_record_events
WHERE created_at >= now() - interval '7 days'
GROUP BY 1
ORDER BY ok DESC;
```

## Meta de sucesso (48h após deploy)
- error 131053 = 0
- unsupported_audio_mime = 0
- invalid_ogg ≈ 0
- fallback_mp4 / fallback_webm_document identificam browsers problemáticos.

## Notas
- Guard `415 unsupported_audio_mime` em `meta-whatsapp-send` continua ativo.
- Props opcionais em `<AudioRecorder>`: `endpointId`, `threadId`, `organizationId`. Passar quando disponível para enriquecer os eventos.

## Sanitização do container OGG (2026-08-27)

`opus-media-recorder@0.8.0` finaliza o stream anexando um **pacote de comprimento zero**
(lacing `0` no fim da segment table da última página, marcada EOS). Um pacote Opus vazio é
inválido (RFC 6716): o ffmpeg falha com `Packet processing failed: Invalid data found` e a
Meta reclassifica o upload como `application/octet-stream` → **erro 131053**.

`src/lib/sanitizeOggOpus.ts` remove esse lacing, decrementa `page_segments` e recalcula o
CRC32 Ogg apenas da página final. Nenhum byte de payload é alterado; sem recodificação.
A correção é aplicada em `AudioRecorder.onstop`, antes do preview/envio, e é idempotente.

Salvaguardas (qualquer desvio → Blob intacto + motivo em telemetria, sem reparo genérico):
cadeia de páginas completa terminando exatamente no fim do buffer, `stream_structure_version = 0`,
última página com EOS, último lacing `= 0`, `page_segments >= 2` e lacing anterior `!= 255`.

`validateOggOpus` ganhou checagem de cauda (`isSendableOggOpus`): envio falha fechado se
sobrar qualquer pacote de comprimento zero ou se a última página não tiver EOS.

Novos eventos:
- `audio_record_ogg_tail_fixed` — pacote vazio removido (`metadata.reason`, `metadata.originalSizeBytes`).
- `audio_record_ogg_structure_invalid` — container reprovado nas salvaguardas (`error` = motivo).

```sql
SELECT event, count(*), min(created_at), max(created_at)
FROM public.audio_record_events
WHERE event IN ('audio_record_ogg_tail_fixed','audio_record_ogg_structure_invalid')
  AND created_at >= now() - interval '48 hours'
GROUP BY 1;
```

Áudios históricos já armazenados **não** foram reprocessados nesta entrega.
