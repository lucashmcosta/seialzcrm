# Voice — Twilio (WebRTC)

## Fluxo

- **Setup:** `twilio-setup` (persistência de credenciais).
- **Token JWT:** `twilio-token` — gera Access Token para o SDK WebRTC no browser (`getTwilioAccessToken` em `src/lib/authSession.ts`).
- **Outbound:** `twilio-call` (originate). WebRTC no cliente via `@twilio/voice-sdk`.
- **Webhook:** `twilio-webhook` (status, TwiML). Filtra por integração (memory `integrations/twilio-voice-security-isolation`).
- **Mídia:** `twilio-media-proxy` para gravações autenticadas.
- **Transcrição:** `transcribe-audio` (Whisper via Lovable AI Gateway).

## UI

- `src/contexts/OutboundCallContext.tsx` gerencia state e SDK.
- `src/components/calls/InboundCallHandler.tsx` + `OutboundCallHandler.tsx` (lazy).
- Isolamento por rota: desativa em `/admin/*`.
- Provider isolation (memory `architecture/outbound-call-provider-isolation`).

## Env vars

`TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_TWIML_APP_SID`.

## Tabelas

`calls`, `call_recordings`, `audio_transcriptions`, `communication_endpoints` (canal voice).

## Observações

- Memory `integrations/twilio-voice-architecture-consolidated` — arquitetura completa.
- Retention de transcrições via `intelligence-retention-cron`.
