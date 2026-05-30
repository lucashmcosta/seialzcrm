# Módulo de Atendimento `/inbox` — Fase 1 (somente leitura)

Pronto para executar. Schema confirmado via query: `message_threads` tem `assigned_user_id`, `status`, `sla_first_response_target_at`, `sla_resolution_target_at`, `first_response_at`, `resolved_at`, `priority`. `thread_assignment_history` tem `action_type`, `from_user_id`, `to_user_id`, `performed_by_user_id`, `reason`, `metadata`, `created_at`.

## Arquivos a criar

```text
src/hooks/inbox/
 ├─ useInboxQueueCounts.ts   (counts por fila, 5 queries paralelas head:true)
 ├─ useInboxThreads.ts       (lista da fila ativa + realtime isolado)
 └─ useInboxThread.ts        (detalhe + thread_assignment_history)

src/components/inbox/
 ├─ InboxQueues.tsx          (sidebar de filas)
 ├─ InboxThreadList.tsx      (lista filtrada)
 ├─ InboxThreadDetail.tsx    (header + dados + histórico)
 ├─ InboxSlaChip.tsx         (verde/amarelo/vermelho)
 ├─ InboxAssignmentHistory.tsx (read-only)
 └─ InboxMetricsBar.tsx      (counters topo)

src/pages/inbox/
 └─ InboxPage.tsx            (Layout CRM, 3 colunas, placeholder mobile)
```

## Arquivos a editar (mínimo)

- `src/App.tsx` — lazy + `retryImport` para `InboxPage`, rota `/inbox` em `ProtectedRoute`.
- `src/components/Layout.tsx` — adicionar grupo `ATENDIMENTO` com item "Atendimento" (`/inbox`, ícone `Headset`) **abaixo** do grupo COMUNICAÇÃO e separado dele.

## Filas (nomes reais)

- mine: `assigned_user_id = current_user_id`
- unassigned: `assigned_user_id IS NULL AND status = 'open'`
- in_sla: `sla_first_response_target_at > now() AND first_response_at IS NULL`
- overdue: `sla_first_response_target_at < now() AND first_response_at IS NULL AND status = 'open'`
- resolved: `status = 'resolved'`

`current_user_id` resolvido no client via `users.id` (lookup por `auth_user_id`), conforme memory Core.

## Não tocar (confirmado)

`/messages`, `useMessageThreads`, `MessagesList.tsx`, `MobileMessagesList.tsx`, RPCs, migrations, edge functions, Twilio, IA, `/dev/inbox-smoke`.

## Mobile

Placeholder dentro de `/inbox`: "Atendimento mobile em breve. Use desktop por enquanto." Sem redirect.

---

**Aguardando troca para Build Mode para criar os 10 arquivos e editar 2.**
