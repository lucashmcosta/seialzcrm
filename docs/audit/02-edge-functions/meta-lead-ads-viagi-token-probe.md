# meta-lead-ads-viagi-token-probe

Path: `supabase/functions/meta-lead-ads-viagi-token-probe/index.ts` (286 LOC)

## Gatilho
- Chamada admin (verifica `admin_users`) — probe/rotação de token do Viagi.

## Imports de `_shared/`
- `cors.ts`, `crypto.ts` (`decryptSecret`, `encryptSecret`), `meta-graph.ts` (`metaGraphGet`, `MetaGraphError`), `auth.ts` (`validateServiceRoleAuth`)

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `admin_users`, `organization_integrations`, `lead_forms`, `meta_lead_pages`

## Tabelas — ESCRITA
- `organization_integrations` (update — token renovado), `lead_forms` (update)

## APIs externas
- Meta Graph API.

## Observações
- Terceira function Viagi-specific. Consolidação sugerida em uma única `admin-viagi-tools` ou remoção após conclusão.
