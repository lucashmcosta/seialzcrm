# import-knowledge

Path: `supabase/functions/import-knowledge/index.ts` (307 LOC)

## Gatilho
- Chamada do frontend — importa lote de itens de knowledge (payload direto).

## Imports de `_shared/`
- Nenhum.

## Env vars
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`, `user_organizations`, `knowledge_items`

## Tabelas — ESCRITA
- `knowledge_items` (insert)

## APIs externas
- Nenhuma.

## Observações
- Auth por JWT (usa ANON_KEY para validar usuário) e depois SERVICE_ROLE para inserir.
