# twilio-media-proxy

Path: `supabase/functions/twilio-media-proxy/index.ts` (161 LOC)

## Gatilho
- Chamada do frontend (`GET`/`HEAD`) — proxy autenticado para baixar mídia protegida do Twilio (áudios/imagens WhatsApp, recordings).

## Imports de `_shared/`
- Nenhum direto.

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`
- `user_organizations`
- `organization_integrations` (para obter Account SID/Auth Token da org)

## Tabelas — ESCRITA
- Nenhuma.

## APIs externas
- Twilio (baixa a URL de mídia informada pelo cliente com Basic Auth). [INCERTO] host varia por tipo.

## Observações
- Faz streaming/pass-through com `method: req.method === 'HEAD' ? 'HEAD' : 'GET'`.
- Ponto único de vazamento potencial se autorização por org não estiver estrita — vale auditar detalhes de RBAC.
