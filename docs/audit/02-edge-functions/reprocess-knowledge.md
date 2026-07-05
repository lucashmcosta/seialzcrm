# reprocess-knowledge

Path: `supabase/functions/reprocess-knowledge/index.ts` (267 LOC)

## Gatilho
- Chamada — reprocessa knowledge_items existentes (regenera chunks/embeddings).

## Imports de `_shared/`
- Nenhum.

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VOYAGE_API_KEY`

## Tabelas — LEITURA
- `knowledge_items`, `knowledge_chunks`

## Tabelas — ESCRITA
- `knowledge_chunks` (delete + insert)
- `knowledge_items` (update — status)

## APIs externas
- `https://api.voyageai.com/v1/embeddings`

## Observações
- Terceira variante (junto com `process-knowledge` e `process-knowledge-item`). Alta duplicação de lógica de chunking + embed.
