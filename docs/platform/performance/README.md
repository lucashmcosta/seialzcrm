# Platform — Performance

**Fonte:** `docs/audit/07-divida-tecnica.md`, código-fonte.

## Padrões aplicados
- **RLS InitPlan**: `organization_id = ANY(current_user_org_ids())` — evita per-row.
- **Denormalização de threads**: `message_threads.last_message_*` via trigger `trg_update_thread_last_message`.
- **Kanban infinite scroll**: batches de 50 (`/opportunities`).
- **RPCs de listagem paginada de threads**: `rpc_list_message_threads`, `rpc_list_inbox_threads`.
- **Realtime opt in-place**: hooks de mensagens atualizam o cache local em vez de refetch completo.
- **useIsMobile sync check**: `src/hooks/use-mobile.tsx` lê `window.innerWidth` sincronamente no `useState` inicial para evitar flash de layout.
- **retryImport**: `src/App.tsx` — lazy imports com 2 retentativas (1s de intervalo) para recuperar chunk expirado pós-deploy.

## Pontos frágeis (dívida)
- 🟡 `integration-worker` + `intelligence-worker` a cada 30s — RPC contínuo mesmo em orgs ociosas. Considerar back-off adaptativo.
- 🟡 Sem cache de embeddings de queries recentes em `ai-agent-respond` — cada mensagem re-consulta Voyage.
- 🟢 `export-conversations` sem streaming/paginação — arriscado para orgs grandes.
- 🟢 Loop de recálculo entre triggers de `messages`/`message_threads` já foi identificado e corrigido no passado. `[INCERTO — detalhe original não reconstituído; revalidar antes de alterar triggers de denormalização]`

## Limite Supabase
- 1000 rows por query default. Ao debugar "dados faltando", checar esse limite antes de assumir bug.
