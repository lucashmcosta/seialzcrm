
# Fase 1.1 — Escopo CS no /inbox (Opção A + contagem via mesmo helper)

## 1. Arquivos alterados (7)

| # | Arquivo | Ação |
|---|---|---|
| 1 | `src/hooks/inbox/inboxScope.ts` | **CRIAR** — fonte única da regra |
| 2 | `src/hooks/inbox/useInboxThreads.ts` | editar |
| 3 | `src/hooks/inbox/useInboxQueueCounts.ts` | editar |
| 4 | `src/components/inbox/InboxQueues.tsx` | editar |
| 5 | `src/components/inbox/InboxMetricsBar.tsx` | editar |
| 6 | `src/components/inbox/InboxThreadList.tsx` | editar (chips opcionais) |
| 7 | `src/pages/inbox/InboxPage.tsx` | editar |

Nada fora desta lista. `/messages`, RPCs, edge functions, migrations, RLS e Migration 2B intactos.

## 2. Helper `inboxScope.ts` — fonte única

```ts
export type InboxTab = 'active' | 'waiting' | 'resolved_today';
export const EXCLUDED_PURPOSES = ['commercial','vendor_personal'] as const;

interface Params {
  tab: InboxTab;
  onlyMine: boolean;
  internalUserId: string | null;
  orgTimezone: string | null;
  limit?: number; // default 200
}

// Query A: !inner em communication_endpoints, purpose=customer_service
fetchScopeA(p)

// Query B: !inner em contacts, lifecycle_stage=customer, endpoint LEFT
// → client descarta row.primary_endpoint?.purpose ∈ EXCLUDED_PURPOSES
fetchScopeB(p)

// Orquestra A+B, dedupa por id, ordena last_message_at desc, slice(limit)
fetchInboxScopedThreads(p): { rows, debug: { a, bRaw, bFiltered, merged } }

// Conta por aba REUTILIZANDO fetchInboxScopedThreads e medindo rows.length
// (decisão aprovada: prioriza correção conceitual sobre otimização)
fetchInboxScopedCounts(p: Omit<Params,'tab'>): { active, waiting, resolved_today }

startOfDayIso(tz: string | null): string  // fuso da org, fallback UTC
```

### Filtros server-side aplicados em ambas as queries
- `active` → `.in('status', ['open','in_progress'])`
- `waiting` → `.eq('status','awaiting_client')`
- `resolved_today` → `.eq('status','resolved').gte('resolved_at', startOfDayIso(tz))`
- `onlyMine` → `.eq('assigned_user_id', internalUserId)`

### Contagens (estratégia aprovada)
`useInboxQueueCounts` chama `fetchInboxScopedThreads` 3 vezes (uma por aba) e retorna `rows.length`. Garante zero divergência com a lista. Volume real = 6 threads em escopo → custo desprezível.

## 3. Mudanças por arquivo

**`useInboxThreads.ts`** — substitui parâmetro `queue` por `(tab, onlyMine, orgTimezone)`; delega a `fetchInboxScopedThreads`; mantém realtime `inbox-threads-${tab}` com refetch. Expõe `debug` no retorno.

**`useInboxQueueCounts.ts`** — retorno passa para `{ active, waiting, resolved_today }`; delega a `fetchInboxScopedCounts`.

**`InboxQueues.tsx`** — 3 abas (`ChatCircleDots`, `Hourglass`, `CheckCircle`) + Switch "Apenas minhas" acima.

**`InboxMetricsBar.tsx`** — itens `active/waiting/resolved_today`.

**`InboxPage.tsx`** — estado `tab`/`onlyMine`; lê `organization.timezone` via `useOrganizationContext()` e passa aos hooks.

**`InboxThreadList.tsx`** — chips leves para `lifecycle_stage='customer'` e `purpose='customer_service'` quando presentes.

## 4. Não-objetivos
- ❌ Não usar `thread_assignment_history`.
- ❌ Sem RPC, view, migration, edge function, alteração de RLS.
- ❌ Sem tocar em `/messages` ou `useMessageThreads`.
- ❌ Sem paginação cursor (limit fixo 200).
- ❌ Sem iniciar Fase 1.2 ou Migration 2B.

## 5. Relatório obrigatório ao final
1. Query A count
2. Query B count antes das exclusões
3. Query B count após exclusões `commercial`/`vendor_personal`
4. Merged/deduped count
5. Contagens finais: Ativos / Aguardando / Concluídos hoje
6. `rg "InboxQueue\b|useInboxQueueCounts"` listando consumidores
7. Confirmação de `/messages` intocado

## 6. Rollback
Reverter os 7 arquivos. Sem estado persistente criado.
