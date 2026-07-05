# twilio-call

Path: `supabase/functions/twilio-call/index.ts` (186 LOC)

## Gatilho
- Chamada do frontend (`POST`) — inicia chamada outbound via Twilio (usada pelo módulo Voice/OutboundCallContext).

## Imports de `_shared/`
- Nenhum direto.

## Env vars
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`
- `user_organizations`
- `organization_integrations`

## Tabelas — ESCRITA
- `calls` (insert do registro da chamada)

## APIs externas
- Twilio Voice API — [INCERTO] URL não capturada no scan; provavelmente `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json` (padrão do connector).

## Observações
- Coexiste com `twilio-token` (que emite AccessToken para WebRTC no cliente). Aqui parece ser o path Server-Initiated (não WebRTC). [INCERTO] separação exata.
