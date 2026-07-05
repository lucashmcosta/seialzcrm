# Voyage AI (embeddings + reranker)

**Referência técnica:** `docs/audit/04-integracoes/voyage-embeddings.md`.

## Finalidade
- Embeddings de knowledge base (`generate-embedding`, `process-knowledge*`).
- Reranker no pipeline RAG do agente (top 30 → top 5, memory `reranking-and-anti-hallucination-logic`).

## Autenticação
- `VOYAGE_API_KEY` global como fallback.
- Override por org via `organization_integrations` (memory `organization-specific-voyage-ai`).

## Tabelas
`knowledge_items`, `knowledge_chunks`, `knowledge_embeddings`.

## Dívida
🔴 Três funções paralelas (`process-knowledge`, `process-knowledge-item`, `reprocess-knowledge`) com variações mínimas — consolidar.
