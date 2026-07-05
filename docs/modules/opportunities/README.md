# Módulo: Oportunidades

## Rotas
- `/opportunities` — Kanban por `pipeline_stages`
- `/opportunities/:id` — detalhe

## Comportamentos
- Infinite scroll no Kanban em batches de 50 (memory `features/opportunities/kanban-infinite-scroll-performance`).
- Filtragem por status Won/Lost com mapping específico (memory `kanban-status-filtering-and-search`).
- Bulk selection: mover etapa/responsável/excluir em massa (memory `kanban-bulk-selection`).
- Soft-delete propaga a partir de `contacts` (memory `soft-delete-propagation`).
- Mobile: lista vertical com chips (memory `features/mobile/opportunities-kanban-ui`).
