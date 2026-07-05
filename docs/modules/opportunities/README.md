# Módulo: Oportunidades

## Rotas
- `/opportunities` — Kanban por `pipeline_stages`
- `/opportunities/:id` — detalhe

## Comportamentos
- Infinite scroll no Kanban em batches de 50.
- Filtragem por status Won/Lost com mapping status ↔ etapa (trigger `sync_status_from_stage`).
- Bulk selection: mover etapa/responsável/excluir em massa.
- Soft-delete propaga a partir de `contacts` para oportunidades órfãs.
- Mobile: lista vertical com chips no lugar do Kanban.
