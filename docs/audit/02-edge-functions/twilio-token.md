# twilio-token

Path: `supabase/functions/twilio-token/index.ts` (293 LOC)

## Gatilho
- Chamada do frontend — emite Twilio Voice `AccessToken` (JWT) para SDK WebRTC no cliente (`@twilio/voice-sdk`).

## Imports de `_shared/`
- Nenhum direto.

## Env vars
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`
- `user_organizations` (2 leituras)
- `admin_integrations`
- `organization_integrations`

## Tabelas — ESCRITA
- `organization_integrations` (update — [INCERTO] provavelmente cache de estado ONLINE / last_token_at)

## APIs externas
- Nenhuma (gera JWT localmente com Twilio API Key/Secret).

## Observações
- Segurança crítica: assina JWT com credenciais do Twilio. Verificar TTL e escopo do grant. [INCERTO]
