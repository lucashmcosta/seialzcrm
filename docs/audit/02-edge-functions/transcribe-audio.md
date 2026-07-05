# transcribe-audio

Path: `supabase/functions/transcribe-audio/index.ts` (226 LOC)

## Gatilho
- Chamada por worker/backend (protegida por `INTELLIGENCE_WORKER_TOKEN`). Consumida via `intelligence-worker` [INCERTO — não confirmado no scan mas coerente].

## Imports de `_shared/`
- `intelligence/resolve-provider.ts`
- `intelligence/sanitize.ts` (`sanitizeProviderError`, `safeLog`)
- `intelligence/log-usage.ts` (`logAiUsage`)
- `intelligence/pricing.ts` (`estimateAudioCostUsd`)
- `intelligence/settings.ts` (`getIntelligenceSettings`, `shouldTranscribe`)
- `intelligence/analyze-prompt.ts` (`isLikelyHallucination`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTELLIGENCE_WORKER_TOKEN`
- `INTELLIGENCE_AUDIO_STRICT_BYOK`

## Tabelas — LEITURA
- `audio_transcriptions`
- `messages`
- `message_threads`
- `opportunities`
- `sales_events`

## Tabelas — ESCRITA
- `audio_transcriptions` (insert/update)
- `messages` (update — anexar transcrição)
- `intelligence_jobs` (update — status)

## APIs externas
- `https://api.elevenlabs.io/v1/speech-to-text`
- `https://api.openai.com/v1/audio/transcriptions`

## Observações
- Suporta múltiplos provedores STT via `resolve-provider.ts` (ElevenLabs ou OpenAI Whisper).
- Detecta alucinações comuns (`isLikelyHallucination`) — bom exemplo de guarda.
- Uso de BYOK controlado por `INTELLIGENCE_AUDIO_STRICT_BYOK`.
