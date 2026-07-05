# Voyage AI (embeddings + reranker)

## Uso

- `generate-embedding` — embeddings para busca semântica em `knowledge_embeddings`.
- `process-knowledge`, `process-knowledge-item`, `reprocess-knowledge` — chunking + embeddings.
- Reranker: memory `features/ai-agent/reranking-and-anti-hallucination-logic` — top 30 → top 5.

## Env vars

`VOYAGE_API_KEY` (fallback global) — override por org via `organization_integrations` (memory `integrations/organization-specific-voyage-ai`).

## Tabelas

`knowledge_items`, `knowledge_chunks`, `knowledge_embeddings`.

## Observações

- Três funções paralelas fazem chunking (`process-knowledge`, `process-knowledge-item`, `reprocess-knowledge`) com pequenas variações — candidato a consolidação. Ver `07-divida-tecnica.md`.
