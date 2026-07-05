# process-knowledge-item

Path: `supabase/functions/process-knowledge-item/index.ts` (286 LOC)

## Gatilho
- Chamada — processa 1 knowledge_item (chunk + embed).

## Imports de `_shared/`
- Nenhum.

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VOYAGE_API_KEY`

## Tabelas — LEITURA
- `knowledge_items`

## Tabelas — ESCRITA
- `knowledge_chunks` (insert, delete de antigos)
- `knowledge_items` (update — status)

## APIs externas
- Voyage AI (embeddings).

## Observações
- Variante singular de `process-knowledge`. Sugere refator em uma única function parametrizada.
