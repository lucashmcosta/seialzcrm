# Separar definitivamente LEGADO de RPC (90 e 365 dias)

Nenhuma nova RPC, nenhuma RPC por KPI, nenhuma alteração de regra de negócio. Esta etapa é só medição isolada da RPC e decisão de cutover.

## Estado verificado agora no banco

`extensions.pg_stat_statements` registra até este momento **2 chamadas reais** do wrapper `get_sales_dashboard_stats` via PostgREST: `mean_exec_time` **97,2 ms**, `max_exec_time` **100,8 ms**. Ou seja, só o cenário de 30 dias foi executado. Não existe nenhuma medição de banco para 90 e 365 dias — os números altos dos prints (61.398 ms, 32 requests, 29.387 linhas) pertencem exclusivamente ao caminho legado e não dizem nada sobre a RPC.

## Como medir a RPC isolada

Sem tocar em código: a instrumentação já emite `RPC_DURATION_MS` e `RPC_CALL_COUNT`, e eu capturo o tempo de banco por delta de `pg_stat_statements` em torno de cada run.

Para cada período (90 e 365 dias), na Central Trabalhista, todos os vendedores:

1. Você abre `/dashboards` com `parityMode` ativo em aba nova, aguarda `PARITY_RESULT` e me manda o print com `RPC_DURATION_MS`, `RPC_CALL_COUNT`, `USER_PERCEIVED_MS` e `PARITY_RESULT`.
2. Eu tiro snapshot de `pg_stat_statements` imediatamente antes e depois de cada run e reporto: `calls` (deve ser 1 por run), `total_exec_time`, `mean_exec_time`, `max_exec_time`, `rows`.
3. Tempo de rede = `RPC_DURATION_MS` menos o delta de banco.
4. Tamanho do JSON: medido no banco por `octet_length(get_sales_dashboard_stats(...)::text)` para os mesmos limites, e conferido no navegador pelo tamanho da resposta em Network.

Tabela final que eu entrego:

```text
PERÍODO | RPC_MS (browser) | DB_MS | NET_MS | RPC_CALLS | JSON_BYTES | PARITY
```

## Critério de decisão, decidido antes de medir

- **RPC completa < ~1000 ms** nos dois períodos → **nada é otimizado**. Confirmado que o atraso visível é do legado, e o próximo passo é o cutover já descrito (RPC como fonte única em `ReportsPage`, remoção dos fetches paginados de `opportunities` e da instrumentação).
- **RPC materialmente acima disso** → `EXPLAIN (ANALYZE, BUFFERS)` da agregação pelo caminho autorizado (chamada do core dentro de bloco com privilégio, sem grant novo para `authenticated`), medindo o custo por bloco: KPIs, funnel, trend, leaderboard. Só com o bloco culpado identificado eu proponho alteração.
- **Somente se trend/leaderboard provarem ser o peso** → considerar no máximo **duas** chamadas: `summary` (KPIs) e `analytics` (funnel/trend/leaderboard). Nunca uma RPC por card.

## Nesta etapa não entra

Migração, índice, RLS, policy, grant, cron, edge function, cutover, mudança de KPI ou de tela. Só execução, coleta e o relatório consolidado.
