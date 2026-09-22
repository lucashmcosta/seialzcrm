# Módulo: Inbox (Atendimento / Pós-venda)

Superfície de conversas da **equipe de atendimento / customer success**: suporte, coleta de documentos, acompanhamento de processos e relacionamento pós-venda com clientes ativos. **Não confundir com Messages** (comercial/pré-venda) — a separação é decisão de negócio, ver [`product/channel-boundaries.md`](../../product/channel-boundaries.md).

## Rotas
- **`/inbox`** (`src/pages/inbox/InboxPage.tsx`) — feature-flag off, rollout em curso.
- Threads de atendimento falam por endpoints com `purpose ∈ {customer_service, support, other}` (`src/lib/endpointPurpose.ts`); SLAs configurados em `/settings/customer-service`.
- Envio segue o mesmo contrato de Messages: `dispatchWhatsAppSend` resolve pela **linha ativa** `customer_service` (`messaging_lines.active_endpoint_id`) e as send functions honram o `endpointId` explícito. O gate de janela 24h no composer lê `communication_endpoints.requires_template_outside_window` do endpoint efetivo — não mais hardcode por provider. Ver [`plans/2026-07-endpoint-lines-rotation.md`](../../plans/2026-07-endpoint-lines-rotation.md) e [`modules/messages/README.md`](../messages/README.md).

## Status do rollout (Inbox v2)
- Shadow match 150/150 contra a listagem antiga; flag off.
- Pendências: backfill de ~26k eventos, cutover do pipeline de ingest, canal Meta Cloud.
- Especificações e SQL de Fase 0/1: [`docs/inbox-v2/`](../../inbox-v2/README.md).

## Hooks
`src/hooks/inbox/` — `useInboxThreads`, `useInboxThread`, `useInboxThreadMessages`, `useInboxQueueCounts`. RPCs `rpc_list_inbox_threads`, `rpc_inbox_queue_counts`.

## Push mobile (mensagem nova)
- Mesmo caminho de Messages: `notify_new_message()` enfileira `push_delivery_jobs` para o `assigned_user_id` da thread; worker `push-dispatch` (cron 30s) entrega via Expo. Threads `customer_service` recebem `data.url = /inbox/<thread_id>`. Detalhes em [`modules/messages/README.md`](../messages/README.md).

## Leitura da conversa (mudança 2026-09-22)
- O Atendimento no web **passa a gravar leitura** em `message_thread_reads` via `rpc_mark_thread_read` (`InboxPage.tsx` e `MobileInbox.tsx`, efeito ao selecionar a thread). Antes só o app e o Comercial gravavam.
- Efeito visível: conversa lida no computador aparece como lida no celular, e o servidor enfileira o push silencioso `read_sync` para apagar a notificação nos outros aparelhos do mesmo usuário (só nos que declaram `supports_read_sync`). Contrato completo em [`modules/messages/README.md`](../messages/README.md).
