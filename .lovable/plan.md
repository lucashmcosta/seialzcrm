# Correção — período anterior de presets em andamento + delta do card Ganhas (`/dashboards`)

## 1. Delta do card Ganhas (só frontend)

`get_sales_dashboard_stats_core` já retorna `won_count_prev` (existe hoje no CTE `agg`) e o hook já expõe o campo em `DashboardKpis`.

- `src/pages/reports/ReportsPage.tsx`, card "Ganhas": trocar `delta(k.won_value, k.won_value_prev)` por `delta(k.won_count, k.won_count_prev)`.
- O valor em R$ continua exibido. Nenhuma mudança em SQL para este item.

---

## 2. Assinaturas da RPC — estado atual verificado

Consulta a `pg_proc` no banco: existe **exatamente uma** assinatura de cada, sem overloads.

| função | assinatura atual | ACL atual |
|---|---|---|
| `get_sales_dashboard_stats` | `(uuid, timestamptz, timestamptz, date, date, uuid, text)` | `postgres=X`, `authenticated=X`, `service_role=X` |
| `get_sales_dashboard_stats_core` | `(uuid, timestamptz, timestamptz, date, date, uuid, text)` | `postgres=X`, `service_role=X` (sem `authenticated`) |

### Por que `CREATE OR REPLACE` com 4 parâmetros novos NÃO serve

`CREATE OR REPLACE FUNCTION` só substitui quando a lista de tipos de argumento é idêntica. Adicionando 4 parâmetros, o Postgres cria uma **segunda função** (7 args e 11 args). Como os novos parâmetros teriam `DEFAULT NULL`, uma chamada com os 7 parâmetros antigos casaria com as duas candidatas → erro de ambiguidade (`PGRST203` / `function is not unique`), quebrando exatamente as chamadas que queremos preservar.

### Migração: DROP + CREATE, em uma única transação

Ordem dentro da migração:

1. `DROP FUNCTION public.get_sales_dashboard_stats(uuid, timestamptz, timestamptz, date, date, uuid, text);`
2. `DROP FUNCTION public.get_sales_dashboard_stats_core(uuid, timestamptz, timestamptz, date, date, uuid, text);`
3. `CREATE FUNCTION public.get_sales_dashboard_stats_core(...11 args...)` — corpo atual + `COALESCE` no CTE `b`.
4. `CREATE FUNCTION public.get_sales_dashboard_stats(...11 args...)` — mesmos 3 gates atuais (identidade via `current_user_id()`, membership ativo em `user_organizations`, `can_manage_permission_profiles`), repassando os 11 parâmetros ao core.
5. `REVOKE ALL ON FUNCTION` de `public` e `anon` nas duas + `GRANT`s explícitos (abaixo).

`DROP` sem `CASCADE`: se algo mais no banco depender dessas funções, a migração falha em vez de derrubar dependências silenciosamente. Nada além do wrapper referencia o core hoje. Ambos os `DROP` e `CREATE` na mesma transação → nenhuma janela em que a função não exista para o cliente.

### Assinaturas depois da migração (apenas estas duas, sem overload)

```
public.get_sales_dashboard_stats(
  p_organization_id uuid,
  p_from timestamptz, p_to timestamptz,
  p_from_day date, p_to_day date,
  p_owner_user_id uuid DEFAULT NULL,
  p_tz text DEFAULT 'America/Sao_Paulo',
  p_prev_from timestamptz DEFAULT NULL,
  p_prev_to timestamptz DEFAULT NULL,
  p_prev_from_day date DEFAULT NULL,
  p_prev_to_day date DEFAULT NULL
) RETURNS json  -- STABLE SECURITY DEFINER, search_path = public

public.get_sales_dashboard_stats_core( -- mesma lista de 11 parâmetros )
  RETURNS json  -- STABLE SECURITY DEFINER, search_path = public
```

Os 4 parâmetros novos entram **no fim**, todos com `DEFAULT NULL`, preservando a ordem posicional dos 7 existentes.

### GRANT / REVOKE final

```sql
-- wrapper (chamado pelo PostgREST)
REVOKE ALL ON FUNCTION public.get_sales_dashboard_stats(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_dashboard_stats(...) TO authenticated, service_role;

-- core (privado, nunca exposto ao cliente)
REVOKE ALL ON FUNCTION public.get_sales_dashboard_stats_core(...) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_dashboard_stats_core(...) TO service_role;
```

Resultado idêntico à ACL atual: wrapper executável por `authenticated`, core inacessível ao cliente (`42501` se chamado direto, como hoje).

### Alteração no corpo do core (único trecho tocado)

CTE `b`:

```sql
COALESCE(p_prev_from,     p_from - make_interval(days => days)) AS prev_from,
COALESCE(p_prev_to,       p_from)                               AS prev_to,
COALESCE(p_prev_from_day, p_from_day - days)                    AS prev_from_day,
COALESCE(p_prev_to_day,   p_from_day)                           AS prev_to_day
```

`prev_created` / `prev_closed` continuam com fim exclusivo (`>= prev_from AND < prev_to`). Todo o resto do corpo é copiado sem alteração.

---

## 3. Frontend — só os dois presets com semântica especial

Nada do cálculo atual do core é reimplementado em TS. Nova função em `src/lib/report-period.ts`:

```ts
computeExplicitPreviousRange(preset, current, custom): { from: Date; toExclusive: Date } | null
```

- `this_week` → `from = current.from − 7d`, `toExclusive = startOfDay(current.to) − 7d + 1d`
  (qui 03/09/2026: 24/08 00:00 → 28/08 00:00 exclusivo, efetivo **24/08–27/08**).
- `this_month` → `from = dia 1 do mês anterior`, `toExclusive = mesmo dia do mês anterior + 1d`; se o mês anterior não tiver aquele dia (31/03 → fevereiro), usa o último dia do mês anterior
  (qui 03/09/2026: 01/08 00:00 → 04/08 00:00 exclusivo, efetivo **01/08–03/08**).
- **Todos os outros presets, incluindo `custom`** → retorna `null`.

`src/hooks/useSalesDashboardStats.ts`: passa a receber `preset`/`custom`; quando o retorno é `null`, envia os 4 parâmetros como `null` e o `COALESCE` do core preserva byte a byte a lógica atual. `p_prev_to_day` = data (local) de `toExclusive`. Os novos valores entram nas deps do `useEffect`.

`src/pages/reports/ReportsPage.tsx`: repassa `preset`/`custom` ao hook (já tem os dois no estado persistido) + a troca do delta de Ganhas.

---

## 4. Como evitar regressão

- `today`, `yesterday`, `last_week`, `last_month`, `last_7/30/90/365`, `custom`: parâmetros novos vão `NULL` → SQL executado é o mesmo de hoje. `created_count_prev`, `won_count_prev`, `won_value_prev` e `win_rate_prev` não podem mudar.
- Só `this_week` e `this_month` mudam de número. Conferência: `created_count_prev` de "Esta semana" deve igualar um `Personalizado 24/08–27/08`, e de "Este mês" um `Personalizado 01/08–03/08`.
- Sem alteração em RLS, policies, índices, filtros de UI ou na fórmula do percentual (`((atual − anterior) / anterior) × 100`, `null` quando anterior = 0 e atual > 0).

## 5. Fora de escopo (registrado)

`get_home_dashboard_stats` (tela Início) tem a mesma regra de período anterior por duração e **não** será alterada aqui. Se quiser o mesmo alinhamento lá, faço em etapa separada — a assinatura dela também precisaria de DROP + CREATE pelo mesmo motivo.

## 6. Entregáveis

- 1 migração (DROP + CREATE das duas funções + REVOKE/GRANT).
- `src/lib/report-period.ts`, `src/hooks/useSalesDashboardStats.ts`, `src/pages/reports/ReportsPage.tsx`.
- typecheck + build.
