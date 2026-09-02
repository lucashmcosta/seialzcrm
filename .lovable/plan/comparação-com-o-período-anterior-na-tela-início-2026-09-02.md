# Comparação com o período anterior na tela Início

Os três cards da Início (Criadas, Ganhas, Conversão) passam a exibir a variação percentual contra o período anterior, com a mesma regra visual e de cálculo já usada na tela Dashboards (seta para cima verde, para baixo vermelha, traço cinza quando 0,0%).

## Regra (idêntica à Dashboards)

- Período anterior = janela imediatamente anterior, de mesma duração do período selecionado (mesma regra já usada no cálculo da Dashboards).
- Fórmula: `((atual - anterior) / anterior) * 100`.
- Se o anterior é 0: mostra `0,0%` quando o atual também é 0; não mostra nada quando o atual é maior que 0 (evita porcentagem infinita).
- Bases comparadas na Início:
  - Criadas: quantidade criada no período (por `created_at`).
  - Ganhas: quantidade ganha no período (por `close_date`), pois o card mostra quantidade, não valor.
  - Conversão: taxa Ganhas ÷ Criadas de cada período.

## O que muda

1. Ao carregar os KPIs, buscar também as contagens do período anterior (Criadas e Ganhas), respeitando exatamente os mesmos filtros atuais: organização, `deleted_at IS NULL`, responsável selecionado e restrição de quem não pode ver tudo.
2. Passar `delta` para os três `KpiCard` da Início.
3. Nenhuma mudança em cálculos existentes, filtros, RPC, banco, RLS ou regra de negócio. Nada muda no detalhe (modal de lista), no gráfico ou no donut.

## Detalhes técnicos

- `src/pages/Dashboard.tsx`: no `fetchStats`, adicionar duas consultas leves de contagem (`select('*', { count: 'exact', head: true })`) para o período anterior — criadas por `created_at` e ganhas por `close_date` com `status = 'won'` — usando o mesmo `baseQuery()`. Sem paginação de linhas: só contagem, para não pesar o carregamento.
- Período anterior calculado localmente a partir de `from`/`to` já resolvidos por `computeRange`: `prevTo = from - 1ms`, `prevFrom = prevTo - (to - from)`.
- Novos estados `enteredCountPrev` / `closedCountPrev` e uma função `delta(curr, prev)` com a mesma implementação da `ReportsPage`.
- Mobile (`src/components/mobile/MobileDashboard.tsx`): mesma comparação nos três KPIs, reaproveitando o padrão de contagem `head: true` que o arquivo já usa, para o mobile não divergir do desktop.
