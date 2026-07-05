# process-knowledge

Path: `supabase/functions/process-knowledge/index.ts` (265 LOC)

## Gatilho
- Chamada (frontend/cron) — processa lote de knowledge_items pendentes: chunking + embeddings.

## Imports de `_shared/`
- Nenhum.

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VOYAGE_API_KEY`

## Tabelas — LEITURA
- `knowledge_items`

## Tabelas — ESCRITA
- `knowledge_chunks` (insert)
- `knowledge_items` (update — status)

## APIs externas
- Voyage AI (embeddings) — usa `VOYAGE_API_KEY`.

## Observações
- Duplicação óbvia com `process-knowledge-item` (item único) e `reprocess-knowledge`. Três variações do mesmo pipeline.
