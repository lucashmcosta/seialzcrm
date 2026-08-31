# Teste controlado e reproduzível — `/dashboards` legado × `get_sales_dashboard_stats`

Escopo estritamente isolado: só a tela `/dashboards`. Sem cutover, sem tocar `ObservabilityPage`, realtime, `integration_events`, `integration_inbound_events`, buscas `ilike`, RLS, policies ou índices. Nenhuma otimização nesta etapa — só medição.

A fonte que alimenta a UI continua sendo **exclusivamente o caminho legado**. Toda a instrumentação é passiva e só existe sob `?parity=1`.

---

## 1. Instrumentação temporária

### 1.1 Novo arquivo `src/lib/dashboardParityRun.ts`

Módulo puro, sem React, responsável por manter o estado do teste fora do ciclo de render:

- `isParityMode()` — lê `?parity=1`.
- `buildRunKey({ organizationId, fromISO, toISO, ownerId })` — **chave estável**, sem nenhuma dependência de identidade de objeto.
- `runId` curto e determinístico derivado da chave (hash base36 de 6 chars), para o prefixo `[dashboard-test][RUN abc123]`.
- Registro por `runId` em um `Map` de módulo: `legacy`, `rpc`, `logged`, `rpcCallCount`. Um `runId` que já disparou a RPC **nunca** dispara de novo, ainda que o componente re-renderize, remonte em StrictMode ou troque a identidade de `stats`/`legacy`.
- Contadores do legado: `noteRequest(runId, rows)` e marcas `startLegacy` / `endLegacy`.
- Helpers de log com o prefixo único.

### 1.2 `ReportsPage.tsx` — instrumentação do caminho A (legado)

Sem alterar nenhuma query, nenhum filtro, nenhum `useMemo` de cálculo:

- No início de `fetchData()`: `LEGACY_START` (`performance.now()`), zerando os contadores do `runId` atual.
- O helper `paged()` recebe um wrapper que, apenas em modo parity, incrementa `LEGACY_REQUEST_COUNT` por página buscada e soma `LEGACY_ROWS_DOWNLOADED`. A paginação em si (`fetchAllPagedRows`) **não é alterada**.
- Ao fim do `Promise.all`: `LEGACY_END` e `LEGACY_DURATION_MS`.
- `UI_READY_MS`: medido no `requestAnimationFrame` seguinte ao render em que `loading` vira `false` — é o "tempo até os cards preencherem" comparável ao seu cronômetro visual.
- Bytes reais por request: leitura de `performance.getEntriesByType('resource')` filtrando `/rest/v1/opportunities` na janela do run, somando `transferSize` e `duration` — isso dá o **tempo de rede** do legado separado do tempo de banco.

Snapshot do legado para paridade: gravado em um `useRef` (`stats`, `funnel`, `trend`, `userStats`, `openCount`, `openValue`) e lido pela comparação. **Nunca entra em array de dependências.**

### 1.3 `useSalesDashboardStatsShadow.ts` — reescrita do gatilho

Problema atual (causa da chamada repetida): `useEffect` com deps `[organizationId, refreshKey, ownerId, ready, legacy]`, onde `legacy` é objeto recriado a cada `useMemo`.

Novo desenho:

- Deps do efeito: **apenas `runKey` (string) e `ready` (boolean)**.
- Guarda de execução única por `runId` no `Map` do módulo (`rpcStarted`), então `RPC_CALL_COUNT = 1` mesmo com remontagem/StrictMode.
- `AbortController` de verdade via `supabase.rpc(...).abortSignal(controller.signal)`, para que um run abandonado **cancele a consulta no banco** em vez de apenas descartar o resultado.
- Medição: `RPC_START`, `RPC_END`, `RPC_DURATION_MS` (total cliente = rede + banco) e, pela `PerformanceResourceTiming` da chamada `/rest/v1/rpc/get_sales_dashboard_stats`, o detalhamento `network_ms` (conexão/TTFB) × `server_ms` estimado.
- Erros: qualquer falha é logada como `RPC_ERROR: <code> <message>` e marcada `PARITY_RESULT = ERROR` — em especial para distinguir `ACCESS_DENIED` legítimo (org errada) de indevido.
- Ordem preservada: a RPC só dispara depois de `LEGACY_END` (`ready`), então os dois caminhos **não competem por CPU no mesmo instante**.

### 1.4 Formato do log (um bloco por run, emitido uma única vez)

```text
[dashboard-test][RUN abc123] scenario org=<nome> from=<iso> to=<iso> owner=<all|uuid>
[dashboard-test][RUN abc123] LEGACY_START 0.0
[dashboard-test][RUN abc123] LEGACY_END 4820.4
[dashboard-test][RUN abc123] LEGACY_DURATION_MS 4820
[dashboard-test][RUN abc123] LEGACY_REQUEST_COUNT 9
[dashboard-test][RUN abc123] LEGACY_ROWS_DOWNLOADED 13417
[dashboard-test][RUN abc123] LEGACY_NETWORK_MS 512  LEGACY_BYTES 3.1MB  UI_READY_MS 5104
[dashboard-test][RUN abc123] RPC_START ...  RPC_END ...  RPC_DURATION_MS 212
[dashboard-test][RUN abc123] RPC_CALL_COUNT 1
[dashboard-test][RUN abc123] PARITY_RESULT FULL MATCH
```

Mais três `console.table`: KPIs, funnel, trend, leaderboard.

---

## 2. Teste de paridade

Tabela `metric | legacy | rpc | delta | match` para:

**KPIs (13):** `created_count`, `created_count_prev`, `won_count`, `won_value`, `won_value_prev`, `lost_count`, `lost_value`, `win_rate`, `win_rate_prev`, `avg_ticket`, `avg_cycle_days`, `open_count`, `open_value`.

Observação: `created_count_prev`, `won_value_prev` e `win_rate_prev` não existem hoje como número no state legado — só como `delta` percentual. A instrumentação reconstrói os três a partir de `previousOpps` com **exatamente a mesma aritmética** do `useMemo` atual (linhas 310-334), sem alterar o `useMemo`.

**Funnel:** etapa por etapa (`stage_id`/nome, `count`, `value`), mais checagem de contagem de etapas e ordem.

**Trend:** bucket por bucket (`created`, `won`, `won_value`). A RPC devolve buckets diários; a comparação aplica ao lado RPC a mesma regra de bucketização do front (`> 90 dias` → mensal, rótulo por `toLocaleDateString` no mesmo locale) — só no comparador, sem tocar o gráfico.

**Leaderboard:** vendedor por vendedor (`open`, `created`, `won`, `lost`, `won_value`), incluindo a linha `unassigned`, com detecção de vendedor presente em um lado e ausente no outro (`MISSING`).

**Tolerâncias (as já aprovadas):** contagens e valores monetários → **zero**; `win_rate` → ≤ 0,05 pp; `avg_ticket` / `avg_cycle_days` → ≤ 0,01. Qualquer coisa fora disso imprime `DIFF` e o run fecha com `PARITY = MISMATCH`. Nada é arredondado antes da comparação.

---

## 3. Medição no banco (do meu lado, entre os seus testes)

Sempre pelo **wrapper público autenticado**. Nenhum grant temporário no core, nenhum `EXPLAIN` no core.

Antes do teste 1 e depois de cada run, leitura read-only de `extensions.pg_stat_statements` filtrando a chamada PostgREST do wrapper, registrando o **delta** entre snapshots:

| Campo | Fonte |
|---|---|
| chamadas no run | `calls` (delta) |
| tempo total | `total_exec_time` (delta) |
| tempo médio | `mean_exec_time` |
| pico | `max_exec_time` |
| linhas retornadas | `rows` (delta) |
| erro | ausência de entrada + `RPC_ERROR` no console (erros não entram em `pg_stat_statements`) |
| execução duplicada | `calls` delta > 1 para um `runId` com `RPC_CALL_COUNT = 1` |

Com isso o **tempo de banco** vem do delta de `total_exec_time`, o **tempo total cliente** vem do `RPC_DURATION_MS`, e o **tempo de rede** é a diferença. Também amostro `pg_stat_activity` durante cada janela para confirmar ausência de pico de CPU atribuível ao dashboard.

Opcional (só se você autorizar): expor `server_ms` dentro do JSON do wrapper com `clock_timestamp()`, o que daria tempo de banco exato por chamada sem depender de snapshot. Fica **fora** do plano por padrão, para não alterar a função aprovada.

---

## 4. Seu roteiro manual

Todos os testes: aba nova, console limpo, aguardar o bloco `PARITY_RESULT` aparecer, print, e me informar o tempo visual até os cards preencherem.

**Hard refresh:** obrigatório **só no TESTE 1** (`Ctrl+Shift+R` / `Cmd+Shift+R`), para garantir o bundle novo com a instrumentação. Nos testes 2 a 5, refresh normal basta — mas **sempre aba nova**, porque a guarda de execução única é por módulo carregado.

Os filtros de período/vendedor são persistidos em `localStorage`, então em cada teste você **ajusta o filtro na própria tela** e um novo `runId` é emitido automaticamente. Não é preciso mexer na URL além do `?parity=1`.

| # | Organização | URL | Período | Vendedor | Esperado no console |
|---|---|---|---|---|---|
| 1 | Central Trabalhista | `/dashboards?parity=1` (hard refresh) | Últimos 30 dias | Todos os vendedores | 1 bloco `RUN`, `RPC_CALL_COUNT 1`, `PARITY_RESULT FULL MATCH`, `LEGACY_DURATION_MS` na casa de milhares, `RPC_DURATION_MS` de 2 a 3 ordens abaixo |
| 2 | Central Trabalhista | mesma aba ou nova | Últimos 90 dias | Todos | novo `runId`, exatamente 1 chamada de RPC, FULL MATCH |
| 3 | Central Trabalhista | mesma | Últimos 30 dias | **um SDR específico** (ex. Victoria Amorim) | leaderboard com **uma única linha** (o SDR), sem linhas `unassigned` — é a semântica atual auditada |
| 4 | Central Trabalhista | mesma | Últimos 365 dias | Todos | trend **mensal** dos dois lados; é o cenário de maior volume no legado |
| 5 | Viagi | trocar de organização, depois `/dashboards?parity=1` | Últimos 30 dias | Todos | FULL MATCH; se seu usuário não tiver o gate administrativo na Viagi, aparece `RPC_ERROR ACCESS_DENIED` — **esperado e não é falha** |

Sinais de alarme que quero que você me reporte se aparecerem: mais de um bloco `RUN` com o mesmo id, `RPC_CALL_COUNT` maior que 1, qualquer `DIFF` nas tabelas, ou `RPC_ERROR` no teste 1-4.

---

## 5. Critério de cutover (não automático)

Só proponho cutover com todos os itens satisfeitos:

- `RPC_CALL_COUNT = 1` por run, nos 5 cenários;
- `PARITY = FULL MATCH` em todos (Viagi com `ACCESS_DENIED` esperado conta como cenário de permissão, não de paridade);
- nenhum `ACCESS_DENIED` indevido;
- RPC significativamente mais rápida que o legado no tempo de banco medido;
- nenhuma explosão de CPU atribuível ao dashboard durante a janela;
- nenhuma chamada repetida por re-render (`calls` delta = 1 no `pg_stat_statements`).

Depois dos seus prints + meus dados de banco, entrego:

`CENÁRIO | LEGACY_MS | RPC_MS | GANHO % | LEGACY_REQUESTS | RPC_CALLS | PARITY | CPU/OBSERVAÇÃO`

E só então proponho o cutover, em mensagem separada.

---

## 6. Arquivos tocados nesta etapa

| Arquivo | Mudança |
|---|---|
| `src/lib/dashboardParityRun.ts` | **novo** — runId estável, guarda de execução única, contadores, logs |
| `src/hooks/useSalesDashboardStatsShadow.ts` | reescrita do gatilho (deps por string, guarda por runId, abort real, medição) e comparador completo (KPIs + funnel + trend + leaderboard) |
| `src/pages/reports/ReportsPage.tsx` | apenas instrumentação passiva: marcas de tempo, contadores de request/linhas, snapshot em `ref`, `UI_READY_MS`. Zero mudança em query, filtro ou cálculo |

Nada de banco, migração, RLS, policy, índice, cron ou edge function. Todo o código novo é inerte sem `?parity=1`, e removido no cutover.
