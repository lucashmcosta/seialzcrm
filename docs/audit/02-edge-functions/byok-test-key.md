# byok-test-key

Path: `supabase/functions/byok-test-key/index.ts` (36 LOC)

## Gatilho
- Chamada do frontend (admin) — testa a chave BYOK contra o provider.

## Imports de `_shared/`
- `intelligence/byok-shared.ts`, `intelligence/authz.ts` (`requireOrgAdmin`), `crypto.ts` (`decryptSecret`)

## Env vars
- Nenhuma direta.

## Tabelas — LEITURA/ESCRITA
- [INCERTO] leitura via helper.

## APIs externas
- Provider AI (via helper).

## Observações
- Function minimal (36 LOC).
