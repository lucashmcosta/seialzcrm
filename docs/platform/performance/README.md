# Platform — Performance

**Fonte:** `docs/audit/07-divida-tecnica.md`, memories.

## Padrões aplicados
- **RLS InitPlan**: `organization_id = ANY(current_user_org_ids())` — evita per-row.
- **Denormalização de threads**: `message_threads.last_message_*` via trigger (memory `messages/performance-denormalization-strategy`).
- **Kanban infinite scroll**: batches de 50 (memory `kanban-infinite-scroll-performance`).
- **RPC com cursor**: `rpc_list_threads` (memory `rpc-list-threads-pagination`).
- **Realtime opt in-place**: hooks de mensagens fazem update em cache (memory `frontend-realtime-optimization`).
- **useIsMobile sync check**: `window.innerWidth` síncrono para evitar flash de layout (memory `use-is-mobile-sync-initialization`).
- **retryImport**: recuperação de chunk expirado (memory `architecture/dynamic-import-resilience`).

## Pontos frágeis (dívida)
- 🟡 `integration-worker` + `intelligence-worker` a cada 30s — RPC contínuo mesmo em orgs ociosas. Considerar back-off adaptativo.
- 🟡 Sem cache de embeddings de queries recentes em `ai-agent-respond` — cada mensagem re-consulta Voyage.
- 🟢 `export-conversations` sem streaming/paginação — arriscado para orgs grandes.
- 🟢 Trigger loop de recálculo evitado (memory `messages/trigger-performance-loop-finding`).

## Limite Supabase
- 1000 rows por query default. Ao debugar "dados faltando", checar esse limite antes de assumir bug.
