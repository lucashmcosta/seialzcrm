# Correção: instrumentação de paridade não dispara no Preview

Nada de banco, RLS, edge function ou mudança na fonte de dados da tela. Só a camada de diagnóstico.

## Diagnóstico

Verificado nesta investigação:

- `/dashboards` renderiza mesmo `ReportsPage`, que já chama `useSalesDashboardStatsShadow` (linha 400) e a instrumentação passiva.
- A ativação depende exclusivamente de `new URLSearchParams(window.location.search).get('parity') === '1'` (`src/lib/dashboardParityRun.ts:49`).
- Todos os logs saem por `console.info` (`plog`).

Duas causas prováveis para "nenhum log apareceu", ambas compatíveis com o sintoma:

1. **A query string não chega ao app.** No Preview o app roda dentro de um iframe; `?parity=1` colado na barra do Preview fica na página hospedeira, e o iframe carrega `/dashboards` sem `search`. Qualquer navegação interna pela sidebar também descarta a query. Resultado: `isParityMode()` retorna `false` e todo o bloco fica inerte — exatamente o que foi observado.
2. **`console.info` filtrado.** O console do navegador/overlay agrupa `info` no nível "Verbose"/"Info", que costuma vir desmarcado.

Sem log de vida hoje não é possível distinguir uma da outra — é o que a correção resolve primeiro.

## Correção

### 1. Ativação robusta (`src/lib/dashboardParityRun.ts`)

`isParityMode()` passa a considerar, em ordem:

- `?parity=1` na query;
- `parity=1` dentro do hash (`#/dashboards?parity=1`);
- `localStorage.parityMode === '1'`;
- efeito colateral: ao detectar a query/hash, grava `localStorage.parityMode = '1'`, para o modo sobreviver a navegação interna e ao iframe do Preview.

Desligar: `localStorage.removeItem('parityMode')` (ou `?parity=0`, que limpa a flag).

Assim o teste funciona pelo console: `localStorage.parityMode = '1'` e recarregar — sem depender da URL do iframe.

### 2. Todos os logs em `console.log`

`plog` e o log de cenário passam de `console.info` para `console.log`. Erros continuam em `console.error`.

### 3. Logs de vida (heartbeat)

Emitidos exatamente com os textos pedidos:

- `[dashboard-test] parity enabled` — uma única vez, no primeiro `isParityMode()` que retorna `true`, com a origem detectada (query/hash/localStorage);
- `[dashboard-test] hook mounted` — no primeiro render de `useSalesDashboardStatsShadow`, com `runKey`, `ready` e `organizationId`;
- `[dashboard-test] legacy start` — no início de `fetchData`;
- `[dashboard-test] rpc start` / `[dashboard-test] rpc end` — antes e depois da chamada da RPC.

Além disso, um log de diagnóstico quando o modo está ativo mas o efeito não roda, dizendo o motivo (`no runKey` ou `not ready`) — cobre o caso de a RPC nunca disparar por `ready` nunca virar `true`.

### 4. Verificação minha após implementar

Rodo `/dashboards` no navegador headless do sandbox com a flag ligada e confirmo, na saída do console, o bloco completo: `RUN`, `LEGACY_DURATION_MS`, `RPC_CALL_COUNT`, `PARITY_RESULT`. Só depois te devolvo o roteiro dos 5 cenários. Se aparecer `ACCESS_DENIED` por causa do usuário de teste, reporto isso explicitamente em vez de declarar sucesso.

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `src/lib/dashboardParityRun.ts` | ativação por query/hash/localStorage, `console.log`, log `parity enabled` |
| `src/hooks/useSalesDashboardStatsShadow.ts` | `hook mounted`, `rpc start`, `rpc end`, motivo de não-execução |
| `src/pages/reports/ReportsPage.tsx` | `legacy start` |

Continua tudo inerte sem a flag, e removível por completo no cutover.
