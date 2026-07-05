# migrate-legacy-ai-key

Path: `supabase/functions/migrate-legacy-ai-key/index.ts` (128 LOC)

## Gatilho
- Chamada admin (por org admin) — migra chaves antigas AI para o novo esquema BYOK.

## Imports de `_shared/`
- `intelligence/byok-shared.ts`, `intelligence/authz.ts` (`requireOrgAdmin`), `intelligence/sanitize.ts` (`safeLog`)

## Env vars
- Nenhuma direta.

## Tabelas — LEITURA
- `admin_integrations`, `organization_integrations`

## Tabelas — ESCRITA
- `organization_integrations` (update)

## APIs externas
- Nenhuma.

## Observações
- Function de transição — verificar se ainda é necessária (marca de dívida técnica caso todas as orgs já tenham migrado).
