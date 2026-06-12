
## Objetivo

Adicionar nova seção **"Atendimento"** na página `/dashboards` (desktop + mobile) com 5 KPIs de atendimento, respeitando os filtros de período e responsável já existentes.

## KPIs

| # | KPI | Fonte | Cálculo |
|---|-----|-------|---------|
| 1 | Pessoas em contato | `message_threads` | `count(distinct contact_id)` com `created_at` no período |
| 2 | Tempo médio 1ª resposta | `message_threads` | `avg(first_response_at - created_at)` para threads do período com `first_response_at not null` |
| 3 | Encerrados | `message_threads` | `count(*)` com `resolved_at` no período |
| 4 | Total | `message_threads` | `count(*)` criados no período |
| 5 | Tempo médio de resposta | `message_response_times` | `avg(response_seconds)` no período (`created_at`) |

Todos filtrados por `organization_id`. Quando filtro "Responsável" estiver ativo: `assigned_user_id = ownerId` em #1–#4 e `user_id = ownerId` em #5.

## UI

- Nova seção (título **"Atendimento"**) abaixo dos KPIs/Win Rate atuais, mesmo padrão visual.
- Grid de 5 `KpiCard` (`src/components/reports/KpiCard.tsx`). Ícones Phosphor: `Users`, `Timer`, `CheckCircle`, `ChatsCircle`, `ClockClockwise`.
- Tempos formatados como `Xm Ys` (ou `Xh Ym` se ≥ 1h); contagens como inteiros.
- Skeleton via prop `loading` do `KpiCard`.

## Mobile

Replicar os 5 cards em `src/components/mobile/MobileReports.tsx` (mesmo formato dos KPIs mobile existentes), em uma nova seção "Atendimento".

## Arquivos

- `src/pages/reports/ReportsPage.tsx` — novo hook/useEffect com fetch paralelo dos 5 KPIs + render da seção.
- `src/components/mobile/MobileReports.tsx` — mesma lógica de fetch + render mobile.
- `src/lib/format-duration.ts` *(novo, pequeno)* — helper `formatSeconds(s)` reutilizado nos dois.

## Fora de escopo

- Gráficos de tendência de atendimento.
- Alterações de schema/RLS no Supabase (tabelas já existem com policies adequadas).
