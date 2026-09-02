# Criadas x Ganhas: switch de agregação + gráfico de barras

Alterações apenas visuais no card "Criadas x Ganhas" da tela Início. Nenhuma mudança em cálculo de KPI, filtros, banco ou lógica de negócio.

## O que muda

1. Switch de agregação no cabeçalho do card, com duas opções: **Diária** e **Semanal**.
   - O usuário escolhe manualmente; a escolha passa a controlar os buckets do gráfico.
   - Padrão inicial: mantém o comportamento atual (diária até 90 dias do período selecionado, semanal acima disso).
   - O subtítulo continua indicando "Agregação diária" / "Agregação semanal" conforme a seleção.
2. Tipo de gráfico: de linhas para **barras duplas** (Criadas e Ganhas lado a lado por bucket).
   - Cores mantidas: Criadas em azul (`--info`), Ganhas em verde (`--success`).
   - Tooltip, legenda, grid e eixos preservados.

## Detalhes técnicos

- Arquivo: `src/components/reports/DashboardTrendChart.tsx`.
- Estado local `granularity: 'daily' | 'weekly'`, inicializado a partir da regra atual (dias > 90 → semanal) e re-sincronizado quando o período muda, mas sobreponível pelo usuário.
- A lógica de bucketização atual é reaproveitada: `weekly` passa a vir do estado em vez de ser derivado só do tamanho do período.
- Troca de `LineChart`/`Line` por `BarChart`/`Bar` do recharts, com `barCategoryGap` para as duas séries agrupadas e `radius` sutil no topo das barras.
- Controle do switch com os componentes shadcn já usados no projeto (grupo de dois botões toggle compactos), usando tokens semânticos.
