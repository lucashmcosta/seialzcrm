Adicionar dois gráficos ao Dashboard (desktop) abaixo dos KPIs:

1. **Linha — Entradas x Fechamentos no tempo** (`DashboardTrendChart.tsx`)
   - Buckets diários (≤90 dias) ou semanais (>90 dias).
   - Duas séries com cores `--primary` e `--success`.

2. **Donut — Status das oportunidades** (`DashboardStatusDonut.tsx`)
   - Abertas / Ganhas / Perdidas das oportunidades criadas no período.
   - Cores `--primary`, `--success`, `--destructive`. Total no centro.

**Fonte de dados**: estender `fetchStats` em `src/pages/Dashboard.tsx` para uma query única retornando `id, status, created_at, updated_at` filtrando por owner + período (com `.or()` para incluir won fechado no período mesmo se criado antes). Agregação no client.

**Layout**: grid `lg:grid-cols-3` — linha ocupa 2 colunas, donut 1.

**Mobile**: sem mudança.

**Stack**: usar `recharts` via `src/components/ui/chart.tsx` já presente. Sem mudanças de DB/RLS/edge functions.

Arquivos:
- ➕ `src/components/reports/DashboardTrendChart.tsx`
- ➕ `src/components/reports/DashboardStatusDonut.tsx`
- ✏️ `src/pages/Dashboard.tsx`