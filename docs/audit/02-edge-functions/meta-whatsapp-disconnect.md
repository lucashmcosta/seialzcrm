# meta-whatsapp-disconnect

Path: `supabase/functions/meta-whatsapp-disconnect/index.ts` (72 LOC)

## Gatilho
- Chamada do frontend (`POST`) — desconecta WhatsApp Cloud da organização.

## Imports de `_shared/`
- `cors.ts`

## Env vars
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`
- `user_organizations`

## Tabelas — ESCRITA
- `admin_integrations` (update — remoção de vínculo/estado)
- `organization_integrations` (update)
- `communication_endpoints` (update — desativar endpoints da org)

## APIs externas
- Nenhuma.

## Observações
- Function enxuta, sem chamadas externas nem cripto — apenas orquestração de estado local.
