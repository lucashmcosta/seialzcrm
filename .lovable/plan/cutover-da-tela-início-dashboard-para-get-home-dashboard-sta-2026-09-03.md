# Cutover da tela Início (/dashboard) para `get_home_dashboard_stats`

Paridade aprovada (Admin 30d/90d e usuário comum 30d, FULL MATCH, 65–85 ms, 1 chamada por filtro). Esta etapa troca a leitura da tela para a RPC, elimina o download massivo de oportunidades e remove a instrumentação temporária. Nada de RPC, RLS, policy, índice ou regra de permissão é alterado.

## 1. Novo hook de produção

`src/hooks/useHomeDashboardStats.ts` — espelho do padrão já em produção em `useSalesDashboardStats.ts`:

- uma chamada de `get_home_dashboard_stats` por combinação `organization + from + to + owner`;
- parâmetros idênticos aos usados no shadow (`p_from`/`p_to` em ISO, `p_from_day`/`p_to_day` em data local, `p_owner_user_id` nulo quando `all`, `p_tz` do browser);
- `enabled` só depois de `usePersistedFilters` hidratar, `AbortController` real, `loading` próprio;
- tipos: `kpis { created_count, created_count_prev, won_count, won_count_prev }`, `status { open, won, lost }`, `trend [{ bucket_date, created, won }]`.

O wrapper já resolve permissão server-side (Admin vê tudo e pode filtrar por vendedor; não-Admin é forçado ao próprio usuário), então `canViewAll` continua sendo usado apenas para a UI (mostrar/ocultar o seletor de vendedor).

## 2. `Dashboard.tsx`

Passa a consumir a RPC:

- **Criadas**, **Ganhas** e **Conversão** vêm de `kpis`; os deltas usam os `_prev` da RPC com a mesma função `delta()` atual;
- **Status** (donut) vem de `status`;
- **Criadas × Ganhas** (trend) vem de `trend`.

Removido do carregamento da página:

- `fetchStats()` inteiro, com as duas paginações de `opportunities` (`fetchAllPagedRows` de criadas e de ganhas), o `dedupeRowsById`, os dois `count exact/head` do período anterior e todo o cálculo em JS de entered/closed;
- estados `enteredCount`, `closedCount`, `enteredCountPrev`, `closedCountPrev`, `opps` e o `loading` manual;
- imports de `fetchAllPagedRows`/`dedupeRowsById`.

Preservados sem alteração: filtros e persistência, `computeRange`, seletor de vendedor (incluindo a query de `user_organizations` para popular a lista), textos, cores, ordem dos cards, skeletons, rota mobile (`MobileDashboard` não é tocado).

## 3. Modal de detalhes sob demanda

O clique em **Criadas** / **Ganhas** passa a disparar a busca das oportunidades apenas naquele momento, com exatamente os mesmos filtros de hoje (org, `deleted_at IS NULL`, escopo de owner, `created_at` no período para Criadas; `status = 'won'` + `close_date` no período para Ganhas), mesmo `select` (contato, responsável, valor) e mesma ordenação de exibição, com `limit(500)` — igual ao padrão adotado no cutover de `/dashboards`. Enquanto carrega, o modal mostra estado de carregamento; nenhuma dessas linhas é baixada no load da página.

## 4. Componentes de gráfico

`DashboardTrendChart` e `DashboardStatusDonut` hoje recebem linhas brutas e agregam no cliente. Passam a receber os agregados da RPC:

- `DashboardTrendChart`: recebe os buckets diários (`bucket_date`, `created`, `won`) e mantém intacto o switch Diária/Semanal (o modo Semanal apenas soma os buckets diários), as barras duplas, tooltip, legenda e cores;
- `DashboardStatusDonut`: recebe `{ open, won, lost }` e mantém rótulos, cores e o texto “Oportunidades criadas no período”.

Nenhuma mudança visual. Os dois componentes são usados somente pela tela Início.

## 5. Remoção da instrumentação temporária

Excluídos: `src/lib/homeParityRun.ts`, `src/hooks/useHomeDashboardStatsShadow.ts` e todas as marcas `[home-test]` em `Dashboard.tsx` (`startLegacy`, `endLegacy`, `noteRequest`, `noteRender`, `runIdOf`, `legacySnapshot`, `legacySnapshotRef`, `legacyReadyRunId`, `isHomeParityMode`).

## 6. Validação

`npx tsgo --noEmit` e build. Critério final: ao abrir `/dashboard`, exatamente **uma** chamada a `get_home_dashboard_stats` e **nenhum** GET paginado de `opportunities` no carregamento; oportunidades brutas somente ao abrir o modal.

## 7. Arquivos tocados

| Item | Mudança |
|---|---|
| `src/hooks/useHomeDashboardStats.ts` | **novo** (leitor de produção) |
| `src/pages/Dashboard.tsx` | consome a RPC, remove paginações e instrumentação, modal sob demanda |
| `src/components/reports/DashboardTrendChart.tsx` | recebe buckets agregados |
| `src/components/reports/DashboardStatusDonut.tsx` | recebe contagens agregadas |
| `src/lib/homeParityRun.ts`, `src/hooks/useHomeDashboardStatsShadow.ts` | **removidos** |

Fora do escopo: banco, RPC, RLS, policies, índices, grants, permissões, mobile e qualquer refatoração adicional.
