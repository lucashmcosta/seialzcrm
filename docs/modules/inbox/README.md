# Módulo: Inbox (Atendimento / Pós-venda)

Superfície de conversas da **equipe de atendimento / customer success**: suporte, coleta de documentos, acompanhamento de processos e relacionamento pós-venda com clientes ativos. **Não confundir com Messages** (comercial/pré-venda) — a separação é decisão de negócio, ver [`product/channel-boundaries.md`](../../product/channel-boundaries.md).

## Rotas
- **`/inbox`** (`src/pages/inbox/InboxPage.tsx`) — feature-flag off, rollout em curso.
- Threads de atendimento falam por endpoints com `purpose ∈ {customer_service, support, other}` (`src/lib/endpointPurpose.ts`); SLAs configurados em `/settings/customer-service`.

## Status do rollout (Inbox v2)
- Shadow match 150/150 contra a listagem antiga; flag off.
- Pendências: backfill de ~26k eventos, cutover do pipeline de ingest, canal Meta Cloud.
- Especificações e SQL de Fase 0/1: [`docs/inbox-v2/`](../../inbox-v2/README.md).

## Hooks
`src/hooks/inbox/` — `useInboxThreads`, `useInboxThread`, `useInboxThreadMessages`, `useInboxQueueCounts`. RPCs `rpc_list_inbox_threads`, `rpc_inbox_queue_counts`.
