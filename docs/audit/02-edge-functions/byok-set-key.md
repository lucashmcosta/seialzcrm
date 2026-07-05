# byok-set-key

Path: `supabase/functions/byok-set-key/index.ts` (84 LOC)

## Gatilho
- Chamada do frontend (admin da org) — grava/atualiza BYOK (Bring Your Own Key) do provider de IA.

## Imports de `_shared/`
- `intelligence/byok-shared.ts`
- `intelligence/authz.ts` (`requireOrgAdmin`)
- `intelligence/sanitize.ts` (`safeLog`)

## Env vars
- Nenhuma via `Deno.env.get` no arquivo raiz (delegado a `byok-shared.ts`).

## Tabelas — LEITURA/ESCRITA
- [INCERTO] via helper — provavelmente `organization_integrations` / `intelligence_settings`.

## APIs externas
- Nenhuma direta.

## Observações
- Boa arquitetura: 84 LOC finas + lógica centralizada em `_shared/intelligence/byok-shared.ts`. Modelo a seguir.
