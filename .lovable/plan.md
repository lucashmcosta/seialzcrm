# Auditoria READ-ONLY — RPCs existentes vs. dados comerciais de `/dashboards`

Nada foi criado ou alterado. Levantamento feito no banco vivo (`pg_proc`, `pg_stat_statements`) e no código.

Filtrei as funções de `public` por nome (`dashboard|stat|metric|report|kpi|funnel|pipeline|leaderboard|sales|opportunit|seller|rollup|summary|trend`) e cruzei com todas as chamadas `supabase.rpc(` do frontend.

---

## Tabela de aproveitamento

| RPC / Função | O que retorna | Quem usa hoje | Serve para `/dashboards`? | Pode ser reaproveitada? |
|---|---|---|---|---|
| **`get_dashboard_stats(p_organization_id, p_days_ago=30, p_owner_user_id)`** → `json`, plpgsql, **STABLE SECURITY DEFINER** | `open_count`, `pipeline_value` (soma das abertas), `won_amount`, `lost_count`, `new_contacts`, `stage_data[]` (nome do estágio + soma, só `type='custom'`), `won_trend[]` (data + soma das ganhas), `tasks[]` (5), `activities[]` (10). Access check: 1× `user_organizations + current_user_id()`, e depois **consulta sem RLS** | **NINGUÉM.** Zero chamadas em `src/` e **0 calls em `pg_stat_statements`** — função órfã, do dashboard antigo | **Parcialmente (≈40%)** — cobre pipeline aberto (qtd+valor), valor ganho, qtd perdida, distribuição por estágio e uma série temporal | **SIM — é a melhor base.** Já é exatamente o padrão arquitetural que falta ao `/dashboards`. Limites: recorte por `p_days_ago` (não `from`/`to`), usa `updated_at` em vez de `close_date`, só valores (sem contagens de ganhas/criadas), sem período anterior, sem conversão/ticket/ciclo, sem leaderboard, `stage_data` ignora estágios won/lost |
| **`get_opportunities_by_stage(p_organization_id, p_limit_per_stage, p_owner_ids, p_include_no_owner, p_min_amount, p_max_amount, p_close_date_from/to, p_no_close_date, p_created_from/to, p_tag_ids, p_stage_ids)`** → `json`, **STABLE SECURITY DEFINER** (há também um overload antigo de 2 args) | Cards de oportunidades agrupados por estágio, com limite por estágio e filtros ricos | `src/pages/opportunities/OpportunitiesKanban.tsx:282` | **Não diretamente** — devolve linhas de cards, não agregados; e limita por estágio | **Como referência, sim.** É a **prova de performance**: 503 calls, **média 66 ms**, máx 410 ms, na mesma tabela `opportunities` da Central. Confirma que o problema do `/dashboards` é o caminho RLS+paginação, não o volume. O bloco de filtros dela é o modelo de assinatura a copiar |
| **`get_opportunity_stage_counts(org_id)`** → `TABLE(stage_id, opportunity_count, total_amount)`, **STABLE SECURITY DEFINER** | Contagem + soma por estágio, com o gate de permissão resolvido **1×** (`v_can_view_all := user_can_view_all(...)` fora da query) | `OpportunitiesKanban.tsx:345` | **SIM, para 2 cards** — funil / distribuição por estágio e, somando, o pipeline aberto | **SIM, quase pronta.** Mede **20 ms**. Falta: filtro de período e de owner (hoje é org inteira e usa só o owner do usuário logado como recorte de privacidade). Padrão de "resolver `user_can_view_all` uma vez em variável" é exatamente o antídoto ao gargalo por linha |
| **`get_service_dashboard_stats(p_org, p_from, p_to, p_owner)`** → `TABLE(5 colunas)`, **LANGUAGE sql STABLE SECURITY DEFINER** | KPIs de atendimento | `src/hooks/useServiceStats.ts:46` | Já é usada (os 4 cards de Atendimento) | **Não para vendas** — é o **contrato modelo** a espelhar (detalhado abaixo) |
| `get_service_worst_responses(...)` | Piores tempos de resposta | `src/hooks/useServiceWorstResponses.ts:58` | Não (atendimento) | Não |
| `admin_list_pipeline_stages(p_org_id)` | id/name/order_index/type dos estágios | Superfície admin | Auxiliar (rótulos do funil) | Sim, como lookup — mas `pipeline_stages` já é lido direto em `ReportsPage.tsx` |
| `evaluate_opportunity_close_v1`, `fn_snapshot_opportunity_close_v1`, `fn_guard_opportunity_won_requirements_v1`, `fn_build_opportunity_won_payload`, `fn_opportunities_result_timestamps` | Regras/guards/payload de fechamento de oportunidade (triggers e validação) | Fluxo de won/lost | Não — não são agregadores | Não. Mas `fn_opportunities_result_timestamps` importa: é o trigger que popula os timestamps de resultado, ou seja, define qual coluna é a verdade de "quando fechou" |
| `fn_refresh_sales_journeys(p_organization_id, p_ghost_days)` + tabela `sales_journeys` | Materialização de jornadas de venda (Inteligência) | Módulo Inteligência | Não — granularidade de jornada, não KPI de período | Não |
| `kairos_db_stats`, `kairos_table_stats`, `fn_outbox_health_summary`, `fn_inbound_health_summary` | Saúde de infra/filas | Observabilidade / admin | Não | Não |
| `merge_sales_threads`, `provision_sales_endpoint`, `fn_is_canonical_sales_thread`, `fn_is_sales_eligible_endpoint`, `sales_thread_status_rank`, `fn_replay_sales_merge_state` | Roteamento/consolidação de threads comerciais ("sales" no nome, mas domínio messaging) | Messages | Não | Não |
| `rpc_kommo_upsert_opportunity` | Upsert de espelho Kommo | Integração Kommo | Não | Não |

### Agregados pré-calculados que existem, mas não são RPC

| Objeto | O que tem | Quem preenche | Serve para `/dashboards`? |
|---|---|---|---|
| **`seller_metrics_daily`** (`organization_id, user_id, day, avg/median_response_seconds`) | Métricas **diárias por vendedor** — porém só de tempo de resposta | `supabase/functions/intelligence-rollup-cron/index.ts:55` | **Não para o leaderboard comercial** (não tem ganhas/valor). Mas é o **precedente de rollup diário por vendedor**: se um dia o leaderboard precisar ser instantâneo, a tabela e o cron já existem para receber colunas de vendas |
| **`opportunity_behavior_snapshot`** (`final_status`, `days_to_close`, `won_at`, `lost_at`, contadores) | Já tem **`days_to_close` por oportunidade** — insumo direto do "ciclo médio de venda" | mesmo cron (`:119`), só oportunidades com `updated_at` nas últimas 36h **e que tenham thread** | **Parcialmente, e não confiável como fonte única**: cobertura incompleta (exige thread, janela de 36h, `limit 2000`) e é lido apenas em `src/components/settings/IntelligenceSettings.tsx:76` |
| `sales_events` | Eventos de venda (objeções, sinais de compra) | Inteligência | Não |

---

## Contrato atual de `get_service_dashboard_stats` — o padrão a espelhar

```sql
get_service_dashboard_stats(p_org uuid, p_from timestamptz, p_to timestamptz, p_owner uuid DEFAULT NULL)
RETURNS TABLE (contacts_count int, avg_first_response_seconds numeric,
               resolved_count int, total_count int, avg_response_seconds numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
```

Características do contrato:

1. **`LANGUAGE sql`**, não plpgsql — sem overhead de execução por linha.
2. **`SECURITY DEFINER`** — a RLS de `message_threads`/`message_response_times` **não é avaliada**; o recorte é feito explicitamente nas cláusulas `where organization_id = p_org`.
3. **Uma linha de saída, colunas tipadas** — o frontend não recebe linha bruta nenhuma.
4. **Parâmetros de recorte explícitos**: `p_from`/`p_to` como `timestamptz` e `p_owner` nulo = "todos".
5. **Regra de negócio dentro da função**: CTE `cutoff` fixa o início do módulo (`2026-05-30T03:00:00Z`) e aplica `greatest(p_from, service_start)` — o mesmo cutoff que o frontend replica em `src/lib/serviceCutoff.ts`.
6. **CTEs nomeadas por conceito** (`t`, `first_rt`, `all_rt`) e os 5 KPIs como subselects sobre elas — um único plano.
7. Consumo: `useServiceStats.ts` faz 1 `supabase.rpc`, trata `Array.isArray(rows) ? rows[0] : rows` e coage números.
8. Custo medido em produção: **187 ms de média** (78 calls), máx 1.538 ms.

**Ponto de atenção do modelo:** `p_owner` filtra por `assigned_user_id`, mas a função **não verifica se o chamador pertence a `p_org`** — quem tiver o `p_org` lê os KPIs de qualquer org. `get_dashboard_stats` e `get_opportunity_stage_counts` **fazem** essa checagem (`user_organizations` + `current_user_id()` / `user_can_view_all`). Se um `get_sales_dashboard_stats` for criado, ele deve seguir `get_dashboard_stats`/`get_opportunity_stage_counts` neste ponto, não `get_service_dashboard_stats`.

## Existe padrão arquitetural equivalente para Sales?

**Existe, e está espalhado em três funções que ninguém juntou:**

- `get_dashboard_stats` — o agregador de vendas completo em JSON, **órfão, zero uso**;
- `get_opportunity_stage_counts` — o funil, com o gate de permissão resolvido 1× (20 ms);
- `get_opportunities_by_stage` — a assinatura rica de filtros e a prova de que `opportunities` responde em 66 ms sob SECURITY DEFINER.

O que **não** existe em nenhuma delas: contagem de criadas por período, contagem de ganhas/perdidas (só valor/qtd parciais), período anterior para comparação, conversão, ticket médio, ciclo médio e leaderboard por vendedor.

E `/dashboards` (`src/pages/reports/ReportsPage.tsx`) **não usa nenhuma das três** para a parte comercial — baixa ~17,4k linhas em ~21 requests paginados. Ou seja: o padrão certo já foi construído neste projeto três vezes e o dashboard comercial ficou fora dele.

---

## Conclusão da auditoria

| Card de `/dashboards` | Já coberto por RPC existente? |
|---|---|
| Pipeline aberto (qtd) | `get_dashboard_stats.open_count` / `get_opportunity_stage_counts` |
| Pipeline aberto (valor) | `get_dashboard_stats.pipeline_value` |
| Distribuição por estágio / funil | `get_dashboard_stats.stage_data` (só `custom`) / `get_opportunity_stage_counts` (todos, com valor) |
| Ganhas (valor) | `get_dashboard_stats.won_amount` — mas por `updated_at`, não `close_date` |
| Perdidas (qtd) | `get_dashboard_stats.lost_count` — mesma ressalva |
| Série temporal | `get_dashboard_stats.won_trend` — só ganhas por valor; o dashboard plota criadas |
| Oportunidades criadas | **Não** |
| Ganhas (qtd) / Perdidas (valor) | **Não** |
| Conversão | **Não** (derivável de criadas+ganhas) |
| Ticket médio | **Não** (derivável) |
| Ciclo médio | **Não** (`opportunity_behavior_snapshot.days_to_close` existe, cobertura parcial) |
| Leaderboard por vendedor | **Não** |
| Comparação com período anterior | **Não** |

**Veredito:** não é preciso partir do zero, e também não dá para só chamar algo que já existe. O caminho de menor risco é **estender `get_dashboard_stats`** (órfã → zero risco de regressão, já `SECURITY DEFINER` com access check correto), migrando `p_days_ago` para `p_from`/`p_to`, trocando `updated_at` por `close_date` onde o dashboard usa `close_date`, e adicionando as contagens, o período anterior e o leaderboard — reaproveitando o padrão de gate 1× de `get_opportunity_stage_counts` e a assinatura de filtros de `get_opportunities_by_stage`.

Antes de escrever qualquer SQL, o próximo passo que sugiro é confirmar duas decisões de contrato:

1. **Reusar `get_dashboard_stats` (renomeando/estendendo) ou criar `get_sales_dashboard_stats` novo** e deixar a órfã para remoção posterior.
2. **Qual coluna é a verdade de "fechamento"** — o `/dashboards` usa `close_date` (data local, via `parseLocalDate`) e `get_dashboard_stats` usa `updated_at`. Precisam convergir, ou os KPIs vão divergir dos números atuais.

Nada será implementado sem sua aprovação.
