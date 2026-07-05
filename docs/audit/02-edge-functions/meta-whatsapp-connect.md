# meta-whatsapp-connect

Path: `supabase/functions/meta-whatsapp-connect/index.ts` (651 LOC)

## Gatilho
- Chamada do frontend (`POST`) — fluxo de conexão da conta WhatsApp Cloud da organização (grava/atualiza credenciais).

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`encryptSecret`, `decryptSecret`)
- `meta-whatsapp/graph.ts` (`validateCredentials`, `MetaWaGraphError`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`
- `user_organizations`
- `communication_endpoints`
- `admin_integrations`
- `organization_integrations`

## Tabelas — ESCRITA
- `communication_endpoints` (insert/update dos números conectados)
- `admin_integrations` (update)
- `organization_integrations` (insert/update — credenciais cifradas)

## APIs externas
- Meta Graph API via `validateCredentials` (valida `phone_number_id` / `waba_id`).

## Observações
- Credenciais sensíveis (access token, app secret) são cifradas via `encryptSecret` antes de persistir.
- Function coexiste com `admin_integrations` (config global do provedor) e `organization_integrations` (config por org) — sinaliza o modelo two-layer descrito em `mem://integrations/admin-integrations-management-system`.
