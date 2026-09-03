# Correção — período anterior de presets em andamento + delta do card Ganhas (`/dashboards`)

## 1. Delta do card Ganhas (só frontend)

`get_sales_dashboard_stats_core` **já retorna `won_count_prev`** (linha 98 do agg) e o hook já expõe o campo em `DashboardKpis`. Portanto:

- `src/pages/reports/ReportsPage.tsx`: no card "Ganhas", trocar `delta(k.won_value, k.won_value_prev)` por `delta(k.won_count, k.won_count_prev)`.
- Valor financeiro (R$) continua no card como está. Nenhuma mudança em SQL.

## 2. Período anterior alinhado ao calendário

Hoje o período anterior é calculado **dentro do core** (`GREATEST(1, dias)` + `p_from - interval`), sem saber qual preset foi escolhido. Correção mínima: o frontend passa a informar o período anterior, e o core usa esse valor quando recebido.

### 2.1 `src/lib/report-period.ts`
Nova função `computePreviousRange(preset, current, custom)`:

- `this_week`: `from = current.from - 7d`, `to = endOfDay(current.to - 7d)` → 24/08–27/08 quando atual é 31/08–03/09.
- `this_month`: `from = dia 1 do mês anterior`, `to = endOfDay(mesmo dia do mês anterior)`; se o mês anterior não tiver aquele dia (ex.: 31/03 → fev), usa o último dia do mês anterior.
- Todos os outros presets (`today`, `yesterday`, `last_week`, `last_month`, `last_7/30/90/365`, `custom`): janela de mesma duração imediatamente anterior — **mesma fórmula que o core já usa hoje**, replicada no TS para manter os números idênticos (`from - N dias` até `from` exclusivo, expresso como `to = from - 1ms` / `prev_to_day = from_day - 1`).

### 2.2 `src/hooks/useSalesDashboardStats.ts`
Passar a receber `preset`/`custom` (ou o `prev` já calculado) e enviar 4 parâmetros novos: `p_prev_from`, `p_prev_to`, `p_prev_from_day`, `p_prev_to_day`. `runKey`/deps do `useEffect` incluem os novos valores.

### 2.3 Migração SQL (assinatura aditiva)
`get_sales_dashboard_stats_core` e o wrapper `get_sales_dashboard_stats` ganham os 4 parâmetros novos, **todos com `DEFAULT NULL`**, ao final da lista. No CTE `b`:

```sql
COALESCE(p_prev_from,     p_from - make_interval(days => days)) AS prev_from,
COALESCE(p_prev_to,       p_from)                               AS prev_to,
COALESCE(p_prev_from_day, p_from_day - days)                    AS prev_from_day,
COALESCE(p_prev_to_day,   p_from_day)                           AS prev_to_day
```

Os filtros `prev_created`/`prev_closed` continuam `>= prev_from AND < prev_to` (fim exclusivo), então o frontend envia `prev_to = prev_from do dia seguinte ao último dia` — na prática `prev_to = último dia + 1 dia 00:00` e `prev_to_day = último dia + 1`.

Wrapper mantém os 3 gates atuais (identidade, membership ativo, `can_manage_permission_profiles`) e apenas repassa os novos parâmetros. Grants: `EXECUTE` em `authenticated` para o wrapper, core segue privado.

## 3. Como evitar regressão

- Parâmetros novos com `DEFAULT NULL` + `COALESCE`: se alguma chamada não enviar, o comportamento é **byte-idêntico** ao atual.
- Para `today`, `yesterday`, `last_week`, `last_month`, `last_7/30/90/365` e `custom`, a função TS reproduz exatamente a janela que o core calcula hoje — validação: rodar os presets e conferir que `created_count_prev`, `won_count_prev`, `won_value_prev` e `win_rate_prev` não mudam.
- Só `this_week` e `this_month` devem mudar de número. Verificação pontual: comparar `created_count_prev` de "Esta semana" com um `Personalizado 24/08–27/08` e de "Este mês" com `Personalizado 01/08–03/08`.
- `CREATE OR REPLACE` com parâmetros adicionais na mesma ordem não cria sobrecarga nem quebra chamadas existentes.
- Sem mudança em RLS, policies, índices, filtros de UI ou cálculo do percentual (`((atual − anterior) / anterior) × 100`).

## 4. Fora de escopo (registrado)

A tela Início `/dashboard` usa `get_home_dashboard_stats`, que tem a **mesma** regra de período anterior por duração. Não será alterada aqui; se quiser o mesmo alinhamento lá, faço em etapa separada.

## 5. Entregáveis

- 1 migração (core + wrapper, aditiva).
- `src/lib/report-period.ts` (nova função), `src/hooks/useSalesDashboardStats.ts` (novos params), `src/pages/reports/ReportsPage.tsx` (delta de Ganhas + passar preset/custom).
- typecheck + build.
