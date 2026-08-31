# Refatoração de performance do Dashboard Comercial (`/dashboards`)

Objetivo único: trocar o caminho de obtenção dos dados (hoje ~21 requests paginados, 3k–17k linhas baixadas) por uma RPC agregadora. **Nenhum KPI muda de valor, nenhuma tela muda, nenhuma regra de negócio muda.**

---

## 1. Auditoria interna de `get_dashboard_stats` (lida no banco vivo)

Assinatura atual: `get_dashboard_stats(p_organization_id uuid, p_days_ago int = 30, p_owner_user_id uuid = null) returns json`, `plpgsql STABLE SECURITY DEFINER set search_path=public`. Órfã: zero chamadas no `src/` e zero em `pg_stat_statements`.

| Bloco da função | Veredito | Motivo |
|---|---|---|
| Access check (`user_organizations` + `current_user_id()`, 1×) | **Reaproveitar integralmente** | É exatamente o gate correto, resolvido uma vez fora das queries |
| `SECURITY DEFINER` + `set search_path` | **Reaproveitar** | Elimina a avaliação de `user_can_view_all` por linha (causa raiz medida: 2–7 s vs 85 ms) |
| Pipeline aberto: `count(*)`, `sum(amount)` com `status='open'`, `deleted_at is null`, owner opcional | **Correto, reaproveitar** | Idêntico ao que o front calcula sobre `openOpps` |
| `won_amount` filtrado por `updated_at >= v_date_filter` | **Substituir** | O dashboard usa `close_date` entre `from` e `to`; `updated_at` produz números diferentes |
| `lost_count` por `updated_at` | **Substituir** | mesma razão |
| `stage_data` (só `ps.type='custom'`, só `sum(amount)`, sem `count`) | **Substituir** | O funil da tela precisa de `count` **e** `value` por etapa, e a tela já lê apenas etapas `custom` — manter o recorte `custom`, adicionar `count` |
| `won_trend` (`updated_at::date`, só valor) | **Substituir** | A tela plota `created`, `won` e `wonValue` por bucket, derivados de `created_at` e `close_date` |
| `new_contacts` (tabela `contacts`) | **Remover do contrato** | Nenhum card de `/dashboards` consome isso |
| `tasks` (5 linhas) e `activities` (10 linhas) | **Remover do contrato** | Resíduo do dashboard antigo; `/dashboards` não exibe nenhum dos dois. Carregar linhas aqui contraria o objetivo de performance |
| `p_days_ago` | **Migrar a assinatura** | Sem gambiarra: nova assinatura com `p_from`/`p_to` (overload distinto, a antiga fica intocada até a remoção final) |

## 2. Coluna canônica de fechamento — auditada, não assumida

Auditado: trigger `fn_opportunities_result_timestamps` (BEFORE INS/UPD) preenche `won_at`/`lost_at` com `now()` na transição de `status`, e limpa quando sai de won/lost, marcando `*_source='trigger'`. Ou seja `won_at`/`lost_at` são **timestamps de evento** (quando o registro mudou de status no sistema), não a data comercial do fechamento.

Contagem no banco (`deleted_at is null`):

| status | total | com `close_date` | com `won_at` | com `lost_at` | fechadas sem `close_date` | `won_at::date <> close_date` |
|---|---|---|---|---|---|---|
| won | 1.334 | 1.295 | 1.334 | 0 | 39 | **250** |
| lost | 15.273 | 15.273 | 0 | 15.273 | 0 | — |

Conclusão: **`close_date` é a coluna canônica de fechamento para relatórios.** Em 250 oportunidades ganhas `won_at::date` divergiria de `close_date`, e o fluxo de fechamento (`transition_opportunity_stage_v1` / `evaluate_opportunity_close_v1`) recebe `_close_date` explicitamente — é o dado informado pelo operador. `won_at`/`lost_at` continuam sendo auditoria de evento e **não** entram na RPC. As 39 ganhas sem `close_date` continuam fora dos KPIs de fechamento, exatamente como hoje (o front descarta `close_date` nulo).

Detalhe crítico de fuso: `close_date` é `date` e o front compara com `parseLocalDate` (meia-noite local). A RPC comparará `close_date` contra os **limites em `date` local** (`p_from`/`p_to` convertidos com o mesmo `America/Sao_Paulo` que `computeRange` gera), nunca contra `timestamptz` — é o que preserva a paridade.

## 3. Contrato final da RPC

```sql
get_sales_dashboard_stats(
  p_organization_id uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_owner_user_id   uuid default null   -- null = todos
) returns json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
```

Nome novo (overload não é possível com tipos diferentes na mesma posição sem ambiguidade); `get_dashboard_stats` fica **intocada** e órfã, marcada para remoção numa etapa posterior. Access check idêntico ao dela, resolvido 1× (`user_organizations` + `current_user_id()`), envolvido numa CTE/`case` que aborta com `ACCESS_DENIED`. Período anterior calculado **dentro** da função com a mesma aritmética do front (`days = round((to-from)/86400000)`, `prevFrom = from - days`, `prevTo = from`, aberto à direita).

JSON retornado:

```
kpis: { created_count, created_count_prev,
        won_count, won_value, won_value_prev,
        lost_count, lost_value,
        win_rate, win_rate_prev,
        avg_ticket, avg_cycle_days,
        open_count, open_value }
funnel:      [{ stage_id, name, order_index, count, value }]
trend:       [{ bucket_date, created, won, won_value }]   -- diário; mensal agregado no front
leaderboard: [{ user_id, full_name, open, created, won, lost, won_value }]
```

Regras replicadas literalmente do `useMemo` atual: conversão = `won_count / created_count * 100` (0 se não houver criadas); ticket médio = `won_value / won_count`; ciclo médio = média de `max(0, close_date - created_at::date)` só das ganhas com `close_date`; `unassigned` como chave do leaderboard quando `owner_user_id` é nulo; leaderboard filtra linhas totalmente zeradas.

## 4. Plano SQL

1. Migração única criando `get_sales_dashboard_stats` (nada é alterado: sem RLS, sem policy, sem índice, sem tocar `get_opportunities_by_stage`, `get_opportunity_stage_counts`, `get_service_dashboard_stats` ou os fluxos do Kanban).
2. CTEs nomeadas por conceito, um único plano: `bounds` (limites `date` locais + período anterior), `scope` (oportunidades da org não deletadas, owner opcional), `created`, `closed`, `prev`, `open`, `stages`, `days`, `people`.
3. `GRANT EXECUTE ... TO authenticated` (a função é `SECURITY DEFINER`; nenhum GRANT de tabela é criado ou alterado).
4. `EXPLAIN ANALYZE` da RPC com a org Central Trabalhista e período de 30/90/365 dias, anexado ao relatório final.

## 5. Plano do frontend

Fase A — validação paralela (nada é removido):
- `src/hooks/useSalesDashboardStats.ts` chama a RPC (1 request), mesmo padrão de `useServiceStats` (coerção numérica, `cancelled` guard).
- `ReportsPage` passa a manter os dois resultados e, em modo de validação, loga a matriz card-a-card (valor antigo, valor novo, diferença) para os 13 KPIs + funil + trend + leaderboard, nos presets 7/30/90/365 dias e ano corrente, com `ownerId = all` e com um SDR específico.

Fase B — corte, **somente após todos os deltas serem zero**:
- remover `fetchAllPagedRows` e `dedupeRowsById` do `ReportsPage`, os 5 fetches paginados, os states `currentOpps` / `previousOpps` / `openOpps` e os `useMemo` de `stats`, `funnel`, `trend`, `userStats`;
- `MobileReports` recebe as mesmas props derivadas da RPC (assinatura preservada, componente não muda);
- o diálogo de detalhe ("criadas/ganhas/perdidas" com lista clicável) **não** pode ser servido por agregados: passa a buscar sua lista sob demanda, só ao abrir, com `ORDER BY` explícito e `limit` — deixa de custar no carregamento da página;
- `UserDetailDialog`, `ServiceResponseDetailDialog` e `useServiceStats` ficam intocados.

Quick wins independentes da RPC: `ORDER BY` explícito nas paginações remanescentes (o diálogo de detalhe — a paginação sem ordenação é bug latente de duplicidade/omissão), remoção dos `Suspense` sem lazy boundary no `ReportsPage`, e `range.from`/`range.to` como dependências reais dos `useMemo` restantes.

## 6. Validação obrigatória (bloqueante)

Para cada preset, uma tabela: `KPI | antigo | novo | diferença`. Cobertura: Oportunidades criadas (+delta), Ganhas qtd, Ganhas valor (+delta), Perdidas qtd, Perdidas valor, Conversão (+delta), Ticket médio, Ciclo médio, Pipeline aberto qtd, Pipeline aberto valor, cada etapa do funil (count e value), cada bucket do trend, cada linha do leaderboard. Tolerância: **zero** para contagens e valores; ≤ 0,05 pp em conversão e ≤ 0,01 em médias (apenas arredondamento numérico). Qualquer divergência acima disso interrompe a entrega e o caminho antigo permanece.

## 7. Relatório de entrega

Contrato final da RPC · SQL aplicado · mudanças de frontend · matriz KPI antigo × novo · `EXPLAIN ANALYZE` · tempo antes (medido: 2–7 s por página, ~28,8 s acumulados no caminho crítico) × tempo depois · confirmação explícita de que nenhuma regra de negócio, filtro, permissão, RLS ou policy foi alterada.

## Fora desta entrega

React Query, cache, RLS, policies, índices, materialized views, cron, rollups, `seller_metrics_daily`, `opportunity_behavior_snapshot`, e a remoção da `get_dashboard_stats` órfã.
