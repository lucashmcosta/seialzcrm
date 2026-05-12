## Objetivo

No `Ranking de vendedores` em `/reports`, ao clicar numa linha de vendedor, abrir um modal com os detalhes do vendedor e as oportunidades dele no período/filtros aplicados — sem pesar a tela.

## Como funciona hoje

- `ReportsPage.tsx` já carrega `currentOpps` (criadas/fechadas no período) e `openOpps` (todas em aberto da org), considerando o filtro de owner.
- `UserLeaderboard` renderiza cada linha com `userId` mas sem `onClick`.

## O que será feito

### 1. Novo componente `UserDetailDialog`
Arquivo: `src/components/reports/UserDetailDialog.tsx`

- Modal usando `Dialog` do shadcn (já usado no projeto).
- Lazy-loaded em `ReportsPage` via `lazy(() => import(...))` para não pesar o bundle inicial.
- Props: `userId`, `userName`, `range`, `organizationId`, `onClose`, `formatCurrency`, `stagesById` (para nome da etapa).
- **Busca sob demanda** (só quando abre): uma única query a `opportunities` filtrando por `owner_user_id = userId`, `organization_id`, `deleted_at is null`, e o mesmo OR de período usado em `fetchData` (criadas no período OU fechadas como won/lost no período). Limite de ~500 + ordenação por `updated_at desc`.
- Conteúdo do modal:
  - Header: avatar + nome
  - Bloco de KPIs do vendedor (reaproveita os números já calculados em `userStats`: abertas, ganhas, perdidas, win rate, valor ganho)
  - Tabs: "Abertas", "Ganhas", "Perdidas"
  - Lista compacta (rolável, `max-h-[60vh]`) com: título, etapa, valor, data, status. Cada item navega para `/opportunities/:id` ao clicar.
  - Estado vazio por aba.
- Loading skeleton enquanto busca.

### 2. Tornar as linhas clicáveis em `UserLeaderboard`
Arquivo: `src/components/reports/UserLeaderboard.tsx`

- Adicionar prop opcional `onRowClick?: (row: UserStats) => void`.
- Quando definida, aplicar `cursor-pointer hover:bg-muted/50` na linha e chamar `onRowClick(r)`.

### 3. Wire-up em `ReportsPage`
Arquivo: `src/pages/reports/ReportsPage.tsx`

- State: `selectedUser: UserStats | null`.
- Passar `onRowClick={setSelectedUser}` para `UserLeaderboard`.
- Renderizar `<UserDetailDialog />` (dentro de `Suspense`) só quando `selectedUser` existir, passando `range`, `organizationId`, `formatCurrency`, e o `stagesById` derivado de `stages`.
- Fechar via `onOpenChange` -> `setSelectedUser(null)`.

## Cuidados de performance

- Componente carregado via `React.lazy` — não entra no bundle inicial da `/reports`.
- A query roda só quando o modal abre, com limite e select enxuto (`id, title, amount, status, pipeline_stage_id, close_date, updated_at, contacts(full_name)`).
- Reaproveita `userStats` para os KPIs do header (sem refetch).
- Sem realtime, sem polling.

## Fora do escopo

- Não muda contadores existentes nem a lógica de KPIs.
- Sem mudanças de banco/RPC.
- Sem alterações na versão mobile do leaderboard (caso exista, fica para depois).