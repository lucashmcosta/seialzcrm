# `get_home_dashboard_stats` — criação + validação em modo shadow (sem cutover)

Auditoria de `/dashboard` aprovada. Esta etapa cria a RPC e valida paridade. **A tela continua exibindo exclusivamente os números do caminho legado.** Nada de RLS, policy, índice ou regra de permissão é alterado.

## 1. Migração — duas funções

**Core privado** `public.get_home_dashboard_stats_core(p_organization_id uuid, p_from timestamptz, p_to timestamptz, p_from_day date, p_to_day date, p_owner_user_id uuid, p_view_all boolean, p_self_user_id uuid, p_tz text)` — `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`, sem nenhuma checagem de permissão. **Sem `GRANT EXECUTE` para `authenticated`/`anon`**: só o wrapper pode chamá-la.

CTEs:
- `scope`: `opportunities` da org, `deleted_at IS NULL`, e filtro de owner resolvido pelo wrapper (`p_self_user_id` quando não view_all; `p_owner_user_id` quando informado e view_all; sem filtro caso contrário);
- `prev_bounds`: período anterior de mesma duração, `prev_to = p_from - interval '1 millisecond'`, `prev_from = prev_to - (p_to - p_from)`, com os equivalentes em `date` para `close_date`;
- `created`, `won`, `created_prev`, `won_prev`, `status`, `days`.

Retorno JSON:
```
kpis:   { created_count, created_count_prev, won_count, won_count_prev }
status: { open, won, lost }              -- entre as criadas no período
trend:  [{ bucket_date, created, won }]  -- diário
```

**Wrapper público** `public.get_home_dashboard_stats(p_organization_id uuid, p_from timestamptz, p_to timestamptz, p_from_day date, p_to_day date, p_owner_user_id uuid default null, p_tz text default 'America/Sao_Paulo')` — PL/pgSQL `STABLE SECURITY DEFINER SET search_path = public`, executado uma única vez por chamada:

1. `v_user_id := current_user_id()`; nulo → `RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002'`;
2. `EXISTS` em `user_organizations` (`is_active = true`) para a org; falso → mesmo `ACCESS_DENIED`;
3. `v_view_all := public.user_can_view_all(p_organization_id, 'opportunities')` — **uma única avaliação por chamada**;
4. se `v_view_all` for falso, ignora `p_owner_user_id` e força escopo ao próprio usuário; se verdadeiro, aplica `p_owner_user_id` quando informado;
5. delega ao core e devolve o JSON.

Sem `can_manage_permission_profiles` aqui — `/dashboard` é para todos os usuários. `GRANT EXECUTE` apenas no wrapper, para `authenticated`.

Aritmética replicada literalmente do frontend: `created_at` comparado em `timestamptz`; `close_date` comparado em `date` local (`p_from_day`/`p_to_day`); ganhas = `status = 'won'` **e** `close_date` no período; status do donut contado somente entre as **criadas** no período, com qualquer status diferente de `won`/`lost` classificado como `open`; buckets do trend por `created_at::date` (criadas) e `close_date` (ganhas), em `p_tz`.

## 2. Frontend — shadow, inerte por padrão

Novo hook `src/hooks/useHomeDashboardStatsShadow.ts`, ativado apenas por `?parity=1` ou `localStorage.homeParityMode = '1'`. Fora desse modo não dispara nada.

Reaproveita o desenho já corrigido do shadow de `/dashboards`:
- `runKey` string estável (`org | fromISO | toISO | owner | viewAll`), sem identidade de objeto nas dependências;
- estado por run `idle | running | done`, reset no abort, para garantir **exatamente uma chamada de RPC por filtro** mesmo com re-render, StrictMode ou remontagem;
- gate de hidratação: nada roda antes de `usePersistedFilters` hidratar (evita o run fantasma de 30 dias que ocorreu em `/dashboards`);
- `AbortController` real via `.abortSignal(...)`.

`Dashboard.tsx` recebe apenas instrumentação passiva: marcas `LEGACY_START/END`, contagem de requests e linhas baixadas, snapshot do resultado legado em `useRef` (nunca em deps), e chamada do hook shadow. **Zero mudança em query, filtro, cálculo, KPI ou render.** `MobileDashboard` não é tocado.

## 3. Comparação exigida

Log único por run, prefixo `[home-test][RUN xxxxxx]`, com tabela `metric | legacy | rpc | delta | match`:

- **Criadas** e **Ganhas** do período;
- **Criadas** e **Ganhas** do período anterior (hoje já vêm de `count exact/head`);
- **deltas** de Criadas, Ganhas e Conversão, recalculados nos dois lados com a mesma função `delta()` e a mesma regra de `prev = 0`;
- **Conversão** (`won / created * 100`, `—` quando `created = 0`);
- **Status**: `open`, `won`, `lost`;
- **Trend**: bucket a bucket, `created` e `won`, aplicando ao lado RPC a mesma agregação semanal do componente quando o switch estiver em Semanal.

Tolerância: **zero** para contagens; ≤ 0,05 pp para Conversão e deltas (só arredondamento). Qualquer diferença acima disso imprime `DIFF` e fecha o run como `MISMATCH`.

Também logados: `RPC_DURATION_MS`, `RPC_CALL_COUNT` (deve ser 1), `LEGACY_DURATION_MS`, `LEGACY_REQUEST_COUNT`, `LEGACY_ROWS_DOWNLOADED`, `RENDER_COUNT`.

## 4. Cenários a validar

| # | Usuário | Período | Esperado |
|---|---|---|---|
| 1 | Admin (com `view_all_opportunities`) | 30 dias | FULL MATCH, `RPC_CALL_COUNT 1` |
| 2 | Admin | 90 dias | FULL MATCH, `RPC_CALL_COUNT 1` |
| 3 | Admin | 12 meses | FULL MATCH, `RPC_CALL_COUNT 1` |
| 4 | Usuário **sem** `view_all_opportunities` | 30 dias | FULL MATCH e escopo restrito ao próprio usuário, provado pela RPC devolver os mesmos números do legado filtrado por `owner_user_id` |

Do meu lado, leio `pg_stat_statements` (via ferramenta de banco, read-only) para separar tempo de banco de tempo de rede, e confirmar `calls` = 1 por run.

## 5. Critério de cutover (etapa separada)

Só proponho o cutover com os 4 cenários em FULL MATCH, `RPC_CALL_COUNT = 1` em todos, e `RPC_DURATION_MS` materialmente abaixo do legado. O cutover — remover as duas paginações, trocar os cards/gráficos para a RPC, adicionar a consulta sob demanda do modal e remover a instrumentação — fica para uma mensagem própria.

## 6. Arquivos e objetos tocados

| Item | Mudança |
|---|---|
| migração | cria `get_home_dashboard_stats` + `get_home_dashboard_stats_core`, e o `GRANT EXECUTE` do wrapper |
| `src/hooks/useHomeDashboardStatsShadow.ts` | **novo**, inerte sem modo parity |
| `src/pages/Dashboard.tsx` | apenas instrumentação passiva + chamada do hook shadow |
| `roadmap.md` | registro das duas etapas (shadow agora, cutover depois) |

Fora desta etapa: cutover, mobile, RLS, policies, índices, grants de tabela, React Query/cache, e qualquer mudança de filtro, permissão ou regra de negócio.
