# meta-whatsapp-verify

Path: `supabase/functions/meta-whatsapp-verify/index.ts` (123 LOC)

## Gatilho
- Chamada do frontend (`POST`) — reverifica credenciais já persistidas (health check da conexão).

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`decryptSecret`)
- `meta-whatsapp/graph.ts` (`validateCredentials`, `MetaWaGraphError`)
- `meta-whatsapp/credentials.ts` (`resolveAppSecretForIntegration`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`
- `user_organizations`
- `admin_integrations`
- `organization_integrations`

## Tabelas — ESCRITA
- `organization_integrations` (update — status de verificação)
- `communication_endpoints` (update)

## APIs externas
- Meta Graph API via `validateCredentials`.

## Observações
- Parcialmente redundante com `meta-wa-diagnose`, que também consulta Graph e escreve estado — [INCERTO] se responsabilidades estão claramente divididas.
