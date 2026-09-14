# Novos gráficos na tela Início: Criadas, Ganhas e Conversão

Mantém o gráfico atual "Criadas x Ganhas" como está e adiciona três gráficos individuais logo abaixo, usando exatamente os mesmos dados já carregados (nenhum novo cálculo, filtro ou consulta ao banco).

## O que muda

1. **Criadas** — gráfico de barras azuis por período (mesma cor do card Criadas).
2. **Ganhas** — gráfico de barras verdes por período.
3. **Conversão** — gráfico de linha laranja, calculado por bucket como Ganhas ÷ Criadas em porcentagem; buckets sem Criadas aparecem vazios (sem ponto), evitando 0% enganoso.

Cada um dos três cards:
- tem o mesmo switch **Diária / Semanal** já usado no gráfico atual, com a mesma regra padrão;
- respeita os filtros de período e responsável já selecionados na tela;
- segue o mesmo visual dos cards existentes (borda, título, subtítulo de agregação, altura do gráfico).

Disposição: o bloco atual (Criadas x Ganhas + Status) permanece no topo; abaixo entra uma faixa com os três novos gráficos, em três colunas no desktop e empilhados no celular. A versão mobile da tela Início continua apenas com os cards de números, sem os novos gráficos.

## Detalhes técnicos

- Novo componente `src/components/reports/DashboardSingleMetricChart.tsx`, reutilizando a bucketização (`startOfDay`/`startOfWeek`, `parseLocalDate`) e o switch de granularidade de `DashboardTrendChart.tsx`; para evitar duplicação, essas funções e o toggle são extraídos para `src/components/reports/trendBuckets.ts` e um subcomponente `GranularityToggle`, e `DashboardTrendChart` passa a consumi-los sem mudança de comportamento.
- Props: `data: HomeTrendRow[]`, `from`, `to`, `loading`, `title`, `metric: 'created' | 'won' | 'conversion'`, `variant: 'bar' | 'line'`, cor via token semântico (`--info`, `--success`, `--orange`).
- Conversão: `won / created * 100` por bucket, `null` quando `created === 0` (recharts com `connectNulls={false}`), eixo Y com sufixo `%` e 2 casas decimais no tooltip.
- `src/pages/Dashboard.tsx`: adiciona um grid `md:grid-cols-3` com os três novos cards após a linha existente, alimentado por `stats.trend`.
- Nenhuma alteração em `useHomeDashboardStats.ts`, nas RPCs ou em KPIs.
