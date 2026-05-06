## Objetivo

Substituir o conteúdo atual do Dashboard (`/dashboard`) por uma visão simplificada e pessoal: cada usuário vê apenas as suas próprias oportunidades, com 3 KPIs principais e filtro de período (com opção de data personalizada).

## Os 3 KPIs

Sempre escopados ao `userProfile.id` do usuário logado (campo `owner_user_id` em `opportunities`) e à `organization_id` ativa.

1. **Oportunidades que Entraram** — `count` de `opportunities` criadas no período (`created_at` dentro do range).
2. **Oportunidades que Fechou (Ganhas)** — `count` de `opportunities` com `status = 'won'` cuja transição ocorreu no período (`updated_at` dentro do range).
3. **Conversão** — `Fechou / Entrou * 100`, formatado como percentual. Quando `Entrou = 0`, exibir `—`.

Todas as queries adicionam `is('deleted_at', null)` e `eq('owner_user_id', userProfile.id)`.

## Filtro de Período

Reaproveitar o componente já existente `src/components/reports/ReportFilters.tsx`, que já implementa todos os presets que queremos + range personalizado:

- Hoje, Ontem
- Esta semana, Semana passada
- Este mês, Mês passado
- Últimos 7 / 30 / 90 / 365 dias
- **Período personalizado** (Popover com Calendar em modo `range`)

Vamos usar apenas a parte de período (sem o seletor de "vendedor"), passando `preset` + `customRange` controlados.

## Mudanças no código

### `src/pages/Dashboard.tsx` (desktop)
- Remover: filtro de "owner", os 5 KPIs antigos (Pipeline, Ganho R$, Perdidas, Novos contatos, etc.), os 2 gráficos, "Minhas tarefas hoje" e "Atividade recente".
- Manter: `Layout`, header "Bem-vindo", branch mobile (`MobileDashboard`).
- Adicionar:
  - State: `preset: PeriodPreset` (default `last_30`), `customRange?: DateRange`, derivado `{ from, to }` via `computeRange(preset, customRange)`.
  - Render `<ReportFilters>` (apenas preset + range; passar `users=[]` e ocultar o select de owner — ver detalhe técnico).
  - 3 cards grandes (grid `md:grid-cols-3`) com os KPIs acima.
  - `useEffect` refetch quando `from`/`to` mudarem.
- Queries (cliente Supabase, sem RPC nova):
  - Entrou: `opportunities` filtrando `created_at >= from && <= to`.
  - Fechou: `opportunities` filtrando `status='won'` e `updated_at >= from && <= to`.
  - Conversão calculada no cliente.

### `src/components/reports/ReportFilters.tsx`
Pequeno ajuste: tornar o seletor de owner opcional via prop `showOwner?: boolean` (default `true`), para reusar no Dashboard sem quebrar `ReportsPage`.

### `src/components/mobile/MobileDashboard.tsx`
Aplicar a mesma simplificação para manter coerência mobile:
- Remover KPIs antigos e bloco de tarefas.
- Mostrar os mesmos 3 KPIs (Entrou / Fechou / Conversão) escopados ao usuário.
- Manter as chips de período atuais (Hoje / 7 / 30 / 90) — sem range personalizado no mobile nessa primeira versão para não inchar a UI.

## Detalhes técnicos

- Sem migração de banco e sem nova RPC: tudo via `supabase-js` no cliente, usando `count: 'exact', head: true`.
- O range vem como `Date` com horas zeradas/end-of-day (`computeRange` já cuida disso) e é convertido para ISO antes das queries.
- Tokens semânticos do design system (sem `text-green-600`/`text-red-600` diretos): usar `text-success`, `text-primary`, `text-foreground`, `text-muted-foreground`.
- Cards com `rounded-md`, padding `p-6`, segue padrão do `KpiCard` existente em `src/components/reports/KpiCard.tsx` (avaliar reuso direto).
- i18n: adicionar chaves `dashboard.entered`, `dashboard.closed`, `dashboard.conversion` em `src/lib/i18n.ts` (pt-BR + en-US).
- Layout: continua dentro de `<Layout>`, sem `p-8` extra (regra do design system).

## Fora de escopo

- Comparativo com período anterior, gráficos, metas, ranking. Podem entrar depois.
- Visão de admin/gestor agregando todos os usuários — a regra é "cada um vê o seu".
