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
