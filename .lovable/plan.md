# Mais uma casa decimal no card de Conversão

O card de Conversão passa a exibir duas casas decimais (ex.: `5.94%` em vez de `5.9%`) nas duas telas: Início e Dashboards, incluindo a versão mobile da Início.

## O que muda

- Início (desktop): valor do card Conversão com 2 casas decimais.
- Início (mobile): mesmo formato, para não divergir do desktop.
- Dashboards: valor do KPI Conversão com 2 casas decimais.

Apenas a formatação do número muda. O percentual de comparação com o período anterior continua com 1 casa decimal, e nada muda em cálculo, filtros, gráficos, banco ou regra de negócio.

## Detalhes técnicos

- `src/pages/Dashboard.tsx` (linha do card conversão): `toFixed(1)` → `toFixed(2)`.
- `src/components/mobile/MobileDashboard.tsx`: mesmo ajuste no valor de conversão.
- `src/pages/reports/ReportsPage.tsx`: `stats.winRate.toFixed(1)` → `toFixed(2)` no KpiCard de Conversão.
- `WinRateGauge` (número grande do gauge) permanece com 1 casa, salvo pedido em contrário.
