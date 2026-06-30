
# Fase 1 — Performance da /inbox

Migration **já aplicada** (índices + RPCs `rpc_list_inbox_threads` e `rpc_inbox_queue_counts`).

Falta o ajuste no client (bloqueado pelo plan mode). Aprovar este plano para liberar build mode.

## O que muda no client

1. **`src/hooks/inbox/inboxScope.ts`** — `fetchInboxScopedThreads` e `fetchInboxScopedCounts` deixam de montar a query via PostgREST e passam a chamar as duas RPCs. Removo `fetchScopeB`/`fetchScopeC`. Adiciono `organizationId` (obrigatório) ao `ScopeParams`. Regra de escopo é a mesma — agora avaliada em SQL no servidor.

2. **`src/hooks/inbox/useInboxQueueCounts.ts`** — recebe `organizationId` e repassa para `fetchInboxScopedCounts`.

3. **`src/pages/inbox/InboxPage.tsx`** — passa `organizationId` para `useInboxQueueCounts`.

4. **`src/components/mobile/MobileInbox.tsx`** — idem.

## Garantias

- Sem mudança de regra de escopo (`lifecycle_stage = 'customer'`, exclusão de `commercial`/`vendor_personal`, opt-in `cs_inbox_includes_service_endpoints`).
- Sem mudança em composer, template selector, `NewConversationDialog` ou envio.
- Sem Fases 2/3/4.
- Counts agora refletem contagem real (antes saturavam em 200 e iam a 0 em timeout); a lista continua paginada em 200 como antes.

## Validação pós-build

- Abrir /inbox e confirmar ausência de `statement timeout` no console.
- Conferir que a aba ativa lista as mesmas threads.
- Conferir contadores das 3 abas.
- Conferir org Viagi (multi-tenant) — nada vaza entre orgs (RPC filtra por `p_organization_id` + RLS continua ativa).
