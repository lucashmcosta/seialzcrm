# Cutover do /dashboards para `get_sales_dashboard_stats`

Objetivo: `/dashboards` passa a montar KPIs, funil, trend e leaderboard com **uma única** chamada à RPC, sem nenhuma carga paginada de `opportunities` no carregamento inicial. Sem mudança de banco, RPC, SQL ou RLS. Sem alteração visual.

## O que muda

### 1. Novo hook de leitura (`src/hooks/useSalesDashboardStats.ts`)
Hook de produção (substitui o shadow). Recebe `organizationId`, `from`, `to`, `ownerId`, `filtersHydrated` e chama exatamente uma vez por combinação de filtros:

`get_sales_dashboard_stats(p_organization_id, p_from, p_to, p_from_day, p_to_day, p_owner_user_id, p_tz)`

Mesmos parâmetros já validados no shadow (incluindo `p_from_day`/`p_to_day` locais e timezone do navegador). Retorna `{ data, loading, error }` com o payload bruto (`kpis`, `funnel`, `trend`, `leaderboard`). Cancelamento por `AbortController` quando os filtros mudam.

### 2. `ReportsPage.tsx` — troca da fonte de dados
- Remover `fetchData()` e os cinco fetches paginados de `opportunities` (`currentCreated`, `currentClosed`, `previousCreated`, `previousClosed`, `openRows`) e os estados `currentOpps` / `previousOpps` / `openOpps`.
- `stats` passa a ser derivado de `data.kpis`, mantendo exatamente os mesmos campos hoje renderizados: `createdCount`, `createdDelta`, `wonCount`, `wonValue`, `wonValueDelta`, `lostCount`, `lostValue`, `winRate`, `winRateDelta`, `avgTicket`, `avgCycle`. Os deltas continuam calculados com a mesma fórmula atual, usando os campos `*_prev` da RPC (`created_count_prev`, `won_value_prev`, `win_rate_prev`) — já batidos como FULL MATCH.
- Pipeline aberto (qtd/valor) passa a vir de `kpis.open_count` / `kpis.open_value`.
- `funnel` passa a vir de `data.funnel` (`name`, `count`, `value`), preservando a ordem das etapas de `pipeline_stages`; `StageDistribution` continua consumindo o mesmo `funnel`.
- `trend`: eixo de buckets continua sendo gerado na página (diário até 90 dias, mensal acima), com os mesmos rótulos de `toLocaleDateString`; os valores passam a ser agregados a partir de `data.trend` (`bucket_date`, `created`, `won`, `won_value`) usando a mesma regra de bucketização já validada na paridade.
- `userStats` passa a vir de `data.leaderboard` (`user_id`, `full_name`, `open`, `created`, `won`, `lost`, `won_value`), com fallback de nome para "Sem responsável" quando `user_id` for `unassigned`, e o mesmo filtro atual de linhas vazias.
- `loading` passa a refletir o loading da RPC. `fetchUsersAndStages()` (usuários e etapas para os filtros) permanece — é leve e não é agregação.
- `MobileReports` continua recebendo exatamente as mesmas props, agora alimentadas pela RPC.

### 3. Dialog de detalhe (Criadas / Ganhas / Perdidas)
Hoje esse dialog lista oportunidades individuais a partir das linhas já carregadas em memória. Com a RPC (só agregados) essa lista precisa de fonte própria, então ela passa a ser carregada **sob demanda, apenas ao abrir o dialog**, com uma consulta escopada (organização + `deleted_at is null` + owner + intervalo por `created_at` ou `close_date` conforme o tipo), ordenada por data e limitada. Nada disso roda no carregamento da tela. Contagem exibida no título passa a usar o KPI correspondente da RPC.

### 4. Remoção da instrumentação temporária
- Excluir `src/lib/dashboardParityRun.ts` e `src/hooks/useSalesDashboardStatsShadow.ts`.
- Remover de `ReportsPage.tsx`: `REPORTS_PAGE_MOUNTED`, todos os logs `[dashboard-test]`, `legacySnapshotRef`, `parityRun`, `noteRender`, `noteUiReady`, os campos `prev*` de diagnóstico que não forem usados pelos deltas, e os imports agora órfãos (`fetchAllPagedRows`, `dedupeRowsById`, `supabase` só se ficar sem uso).

## Não muda
Banco, RPC, migração, RLS, grants, `useServiceStats` (bloco Atendimento), `UserDetailDialog`, `ServiceResponseDetailDialog`, componentes de gráfico, filtros persistidos e layout/estilo.

## Validação
1. Build.
2. Abrir `/dashboards` autenticado no preview e conferir na aba Network: exatamente **1** `POST /rest/v1/rpc/get_sales_dashboard_stats` e **zero** `GET /rest/v1/opportunities` no carregamento.
3. Trocar o período (30 → 90) e confirmar 1 nova chamada da RPC, sem carga paginada.
4. Conferir visualmente que KPIs, funil, trend e leaderboard exibem os mesmos números do último run FULL MATCH.
