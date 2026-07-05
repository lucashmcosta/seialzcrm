# Módulo: Base de Conhecimento

Rotas: `/settings/knowledge-base`, `/settings/edit-kb`.

## Comportamento
- Schema hierárquico (`knowledge_items` → `knowledge_chunks`) + edição conversacional via `knowledge-edit` / `apply-knowledge-edit`.
- Chunking + embeddings via Voyage AI.
- Rerank top 30 → top 5 antes de entregar ao modelo.
- Wizard de importação e enhancement.

## Edge functions
- Ingestão: `import-knowledge`, `import-from-url` (🔴 SSRF — ver dívida).
- Processamento: `process-knowledge`, `process-knowledge-item`, `reprocess-knowledge` (🔴 duplicação — consolidar).
- Embeddings: `generate-embedding`.
- Edição: `knowledge-edit`, `apply-knowledge-edit`, `enhance-knowledge`, `synthesize-knowledge`.
- Wizard: `knowledge-wizard`, `wizard-next-question`, `wizard-generate-content`.
