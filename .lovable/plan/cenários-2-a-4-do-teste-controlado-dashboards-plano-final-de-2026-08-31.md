# Cenários 2 a 4 do teste controlado `/dashboards` + plano final de cutover

Cenário 1 (Central Trabalhista, 30 dias, todos) fechou FULL MATCH com `RPC_CALL_COUNT 1`. Nada de cutover nesta etapa. A instrumentação já está no bundle (`src/lib/dashboardParityRun.ts`, `useSalesDashboardStatsShadow.ts`, `ReportsPage.tsx`) e é inerte sem `parityMode`, portanto **não há alteração de código nesta etapa** — só execução, coleta e consolidação.

## Por que a execução é sua e não minha

O Supabase deste projeto é externo e o sandbox não recebe sessão autenticada: minha sessão headless é redirecionada para `/auth/signin` antes de `ReportsPage` montar. Logo os três runs precisam ser disparados no seu navegador, logado na Central Trabalhista.

## Roteiro dos três cenários

Pré-condição em todos: aba nova, console limpo, `localStorage.parityMode = '1'` presente, e aguardar o bloco fechar em `PARITY_RESULT` antes do print.

| # | Período | Vendedor | Observação |
|---|---|---|---|
| 2 | Últimos 90 dias | Todos | novo `runId`; volume intermediário |
| 3 | Últimos 365 dias | Todos | trend deve virar **mensal** nos dois lados |
| 4 | Últimos 30 dias | Victoria Amorim | leaderboard com **uma única linha**, sem `unassigned` — semântica atual auditada |

Aba nova por cenário, porque a guarda de execução única da RPC vive no módulo carregado. O filtro é ajustado na própria tela (persistido em `localStorage`); um novo `runId` é emitido automaticamente.

De cada cenário eu preciso do print com: `LEGACY_DURATION_MS`, `LEGACY_REQUEST_COUNT`, `LEGACY_ROWS_DOWNLOADED`, `RPC_DURATION_MS`, `RPC_CALL_COUNT`, `REPORTS_RENDER_COUNT`, `USER_PERCEIVED_MS`, `PARITY_RESULT` e as quatro `console.table` (KPIs, FUNNEL, TREND, LEADERBOARD).

Sinais que abortam a etapa: mais de um bloco `RUN` com o mesmo id, `RPC_CALL_COUNT > 1`, qualquer `DIFF`, ou `RPC_ERROR`.

## Minha medição de banco entre os runs

Read-only, pelo wrapper público autenticado, sem grant no core e sem `EXPLAIN` no core: snapshot de `extensions.pg_stat_statements` antes e depois de cada run, registrando delta de `calls`, `total_exec_time`, `mean_exec_time`, `max_exec_time`, `rows`. O tempo de banco vem do delta; o tempo de rede é `RPC_DURATION_MS` menos esse delta. Também amostro `pg_stat_activity` na janela para confirmar ausência de pico de CPU atribuível ao dashboard.

## Relatório consolidado que eu entrego depois

```text
CENÁRIO | LEGACY_MS | RPC_MS | DB_MS | NET_MS | USER_PERCEIVED_MS | GANHO % | LEGACY_REQUESTS | LEGACY_ROWS | RPC_CALLS | RENDERS | PARITY
```

Mais o veredito por matriz (KPIs / FUNNEL / TREND / LEADERBOARD) em cada cenário, e o critério de cutover marcado item por item:

- `RPC_CALL_COUNT = 1` nos quatro cenários;
- `PARITY_RESULT FULL MATCH` nos quatro;
- nenhum `ACCESS_DENIED` indevido;
- RPC materialmente mais rápida no tempo de banco medido;
- nenhuma chamada duplicada no delta de `pg_stat_statements`;
- `REPORTS_RENDER_COUNT` estável entre cenários equivalentes.

Qualquer `DIFF` encerra a etapa em `CUTOVER BLOQUEADO`, com a linha divergente isolada e diagnóstico antes de qualquer proposta.

## Plano final de cutover (apresentado, não executado)

Só entra em mensagem separada, após sua aprovação explícita:

1. `ReportsPage` passa a consumir `get_sales_dashboard_stats` como fonte única dos KPIs, funil, trend e leaderboard; as queries paginadas de `opportunities` do caminho legado são removidas da tela.
2. Bucketização do trend passa a ser aplicada sobre os buckets diários da RPC com a mesma regra atual (`> 90 dias` → mensal, mesmo locale), preservando os gráficos.
3. Tratamento explícito de erro da RPC na tela: estado de falha visível, sem fallback silencioso para o caminho legado.
4. Remoção completa da instrumentação: `src/lib/dashboardParityRun.ts` deletado, `useSalesDashboardStatsShadow.ts` deletado, sentinelas e marcas de tempo retiradas de `ReportsPage.tsx`, e a chave `parityMode` deixa de ser lida.
5. Nada de banco: sem migração, sem RLS, sem policy, sem índice, sem cron, sem edge function — o wrapper e o core já estão no ar e validados.
6. Verificação pós-cutover: um carregamento por cenário confirmando um único request `/rest/v1/rpc/get_sales_dashboard_stats`, zero requests a `/rest/v1/opportunities` na tela, e os mesmos números dos runs de paridade.

Rollback: reverter o commit do cutover restaura o caminho legado, já que nenhum objeto de banco é alterado.
