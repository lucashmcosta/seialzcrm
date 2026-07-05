# byok-rotate-key

Path: `supabase/functions/byok-rotate-key/index.ts` (69 LOC)

## Gatilho
- Chamada do frontend (admin da org) — rotaciona chave BYOK atual.

## Imports de `_shared/`
- `intelligence/byok-shared.ts`, `intelligence/authz.ts` (`requireOrgAdmin`), `intelligence/sanitize.ts` (`safeLog`)

## Env vars
- Nenhuma direta.

## Tabelas — LEITURA/ESCRITA
- [INCERTO] via helper.

## APIs externas
- Nenhuma.

## Observações
- Padrão idêntico a `byok-set-key`.
