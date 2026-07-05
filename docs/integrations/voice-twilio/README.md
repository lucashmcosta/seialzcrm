# Voz — Twilio (WebRTC)

**Referência técnica:** `docs/audit/04-integracoes/voice-twilio.md` e `docs/audit/02-edge-functions/twilio-*`.

## Finalidade
Chamadas outbound e inbound via WebRTC direto no cliente usando `@twilio/voice-sdk`.

## Autenticação
- JWT WebRTC gerado em `twilio-token` (edge function, autenticada pelo JWT do usuário).
- Credenciais Twilio em `organization_integrations`.

## Setup
- `twilio-setup` — inicial.
- Números em `organization_phone_numbers`.

## Chamadas
- Outbound: `twilio-call` inicia + eventos via `twilio-webhook`.
- Inbound: `twilio-webhook` recebe → notifica frontend por realtime.
- Gravações: `call_recordings`.

## Isolamento crítico
- **`OutboundCallProvider` desativa Voice em `/admin/*`** — para não vazar device entre orgs durante impersonação.
- Estado do provider de voz é independente do canal WhatsApp.

## Falhas comuns
- Microfone não permitido no navegador.
- Token WebRTC expirado (renovar periodicamente).
- STUN/TURN bloqueado por firewall corporativo.
