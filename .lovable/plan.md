## Objetivo
Criar uma página **Relatórios** rica e elegante, visível **somente para admins** da organização (mesmo gate usado por "Configurações": `permissions.canManageSettings`). Esta página é separada do Dashboard atual — é um relatório executivo para o seu chefe.

## Onde aparece no Sidebar
Item "Relatórios" será adicionado em ambos os layouts (Seialz e default), no grupo PRINCIPAL, posicionado logo após "Início", e renderizado **apenas se** `permissions.canManageSettings === true`.

```text
Início
Relatórios   ← NOVO (admin only)
Contatos
Oportunidades
Tarefas
```

Ícone: `ChartLineUp` (Phosphor).

## Rota
`/reports` — protegida por `<ProtectedRoute>` + verificação interna de permissão (redireciona para `/dashboard` se não for admin).

## Conteúdo da página

### 1. Cabeçalho + Filtros
- Título "Relatórios" (sem subtítulo, conforme Design System).
- Filtros (chips/selects):
  - **Período**: Hoje · 7d · 30d · 90d · Este mês · Este ano · Personalizado (date range).
  - **Pipeline**: todos / pipeline específico.
  - **Responsável**: todos / usuário específico.

### 2. KPIs principais (linha de 4 cards grandes)
Cada card com número grande, label, ícone discreto e variação vs período anterior (▲/▼ %):
- **Oportunidades criadas no período** (com filtro)
- **Oportunidades ganhas** (qtd + valor)
- **Oportunidades perdidas** (qtd + valor)
- **Win Rate** = `won / (won + lost)` × 100, exibido com barra de progresso semicircular

### 3. Bloco "Conversão / Funil"
Card largo com:
- Funil visual (Recharts `FunnelChart` ou barras horizontais empilhadas) mostrando etapas do pipeline → quantidade em cada etapa.
- Métricas-chave ao lado: Win Rate, Loss Rate, Ticket Médio (won), Ciclo médio de venda (dias entre criação e fechamento ganho).

### 4. Evolução temporal
Card com `AreaChart` mostrando, ao longo do período:
- Linha de oportunidades criadas
- Linha de oportunidades ganhas
- Linha de valor ganho (eixo Y secundário)

### 5. Oportunidades por pessoa (ranking)
Card destaque, formato leaderboard:
| # | Vendedor | Abertas | Ganhas | Perdidas | Win Rate | Valor Ganho |
- Avatar + nome
- Barras horizontais comparativas para Valor Ganho
- Ordenação por valor ganho (default), clicável por coluna
- Medalhas 🥇🥈🥉 nos top 3 (substituídas por badges de cor — sem emoji, conforme regras)

### 6. Distribuição por estágio (gráfico de pizza/donut)
Card mostrando valor total aberto distribuído pelas etapas customizadas do pipeline.

## Detalhes Técnicos

### Arquivos novos
- `src/pages/reports/ReportsPage.tsx` — página principal
- `src/components/reports/ReportFilters.tsx` — barra de filtros
- `src/components/reports/KpiCard.tsx` — card de KPI com delta
- `src/components/reports/WinRateGauge.tsx` — gauge semicircular (Recharts `RadialBarChart`)
- `src/components/reports/PipelineFunnel.tsx` — funil
- `src/components/reports/SalesTrendChart.tsx` — área temporal
- `src/components/reports/UserLeaderboard.tsx` — ranking por usuário
- `src/components/reports/StageDistribution.tsx` — donut

### Arquivos modificados
- `src/App.tsx` — registrar rota lazy `/reports`
- `src/components/Layout.tsx` — adicionar item "Relatórios" em ambos os layouts (Seialz e default), condicionado a `permissions.canManageSettings`
- `src/lib/i18n.ts` — adicionar chaves `nav.reports`, `reports.title`, KPIs, etc. (pt-BR e en-US)

### Fonte de dados
Queries diretas via `supabase.from('opportunities')` agregando client-side (suficiente para volume típico de uma org). Tabelas usadas:
- `opportunities` (status, amount, owner_user_id, pipeline_stage_id, created_at, updated_at)
- `pipeline_stages` (name, order_index)
- `users` + `user_organizations` (lista de vendedores ativos)

Usar `Promise.all` para paralelizar as queries. Cache via React Query (`useQuery` com `queryKey` incluindo período/pipeline/owner).

### Cálculos
- **Win Rate** = `wonCount / (wonCount + lostCount) * 100` (0% se denom = 0)
- **Ciclo médio** = média de `(updated_at - created_at)` em dias para opps com `status = 'won'` no período
- **Delta vs período anterior** = compara mesmo intervalo deslocado para trás
- Por usuário: agrupa opportunities por `owner_user_id` e calcula os mesmos KPIs

### Permissão / Segurança
- Item do sidebar: renderizado apenas se `permissions.canManageSettings`
- Página: no topo, se `!permissions.canManageSettings && !permissions.loading` → `<Navigate to="/dashboard" replace />`
- RLS já protege os dados no banco (policies por `organization_id`)

### Design System
- Wrapper: `<Layout>` (CRM)
- Sem `p-8` direto (Layout gerencia)
- Cores via tokens semânticos (`bg-card`, `text-foreground`, `text-primary`, `text-success`, `text-destructive`)
- Fonte Outfit (UI), Share Tech Mono nos números grandes (font-mono no projeto = `font-data`)
- Bordas 6px (rounded-md), avatares rounded-full
- Header: apenas `<h1 className="text-3xl font-bold">Relatórios</h1>`, sem subtítulo

### Responsivo
- Desktop: grid 4 colunas para KPIs, 2 colunas para gráficos médios
- Tablet: 2 colunas
- Mobile: stack vertical (a página é primariamente desktop, mas degrada bem)

## Não inclui (fora do escopo desta task)
- Exportação CSV/PDF (pode ser adicionada depois)
- Versão mobile dedicada (`MobileReports`) — usa o layout responsivo padrão
- RPC `get_reports_stats` no banco (queries diretas são suficientes inicialmente; otimização posterior se necessário)
