# generate-embedding

Path: `supabase/functions/generate-embedding/index.ts` (132 LOC)

## Gatilho
- Chamada por `ai-agent-respond` e `process-knowledge*` (ou frontend) para gerar embedding pontual.

## Imports de `_shared/`
- Nenhum.

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `knowledge_embeddings`

## Tabelas — ESCRITA
- `knowledge_embeddings` (upsert)

## APIs externas
- [INCERTO] provider de embeddings não capturado no scan — provavelmente Voyage/OpenAI resolvido dinamicamente.

## Observações
- Function pequena; verificar duplicação com pipelines em `process-knowledge` e `reprocess-knowledge` que também geram embeddings.
