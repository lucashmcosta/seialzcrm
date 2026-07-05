# byok-update-policy

Path: `supabase/functions/byok-update-policy/index.ts` (44 LOC)

## Gatilho
- Chamada do frontend (admin) — atualiza policy de uso (strict/permissive/fallback) da BYOK.

## Imports de `_shared/`
- `intelligence/byok-shared.ts`, `intelligence/authz.ts` (`requireOrgAdmin`)

## Env vars
- Nenhuma direta.

## Tabelas — LEITURA/ESCRITA
- [INCERTO] via helper (`intelligence_settings`).

## APIs externas
- Nenhuma.

## Observações
- Family BYOK toda apoiada em `_shared/intelligence/byok-shared.ts` — bom exemplo arquitetural (vs. `meta-whatsapp-*`).
