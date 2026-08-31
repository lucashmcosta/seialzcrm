# Auditoria READ-ONLY — CPU do banco em 100%

Nada foi alterado. Todas as consultas abaixo são de leitura (`pg_stat_activity`, `pg_stat_statements`, `pg_stat_user_tables`, `cron.job`) mais leitura de código.

## Resposta direta

**A `get_sales_dashboard_stats` NÃO é a causa. Ela nunca executou em produção.**

E, no momento desta auditoria, **o banco está ocioso** — o pico já passou.

Os consumidores reais de CPU são consultas de polling administrativo/realtime que fazem **Seq Scan em tabelas grandes**, dezenas de milhares de vezes.

## 1. `pg_stat_activity` (agora)

| Métrica | Valor |
|---|---|
| Backends de cliente | 37 |
| `active` agora | 1 (a própria auditoria) |
| `idle in transaction` | 0 |
| Consulta mais longa ativa | 00:00:00 |

Único backend de longa duração: `START_REPLICATION SLOT supabase_realtime_...` (walsender do Realtime, 2h28m, esperando WAL — normal). Ou seja: **o pico de CPU não está em curso**; a análise a seguir é por acumulado.

## 2. `pg_stat_statements` — top por tempo total acumulado

`pg_stat_database.stats_reset` é `NULL`, então os números são acumulados desde o início (sem janela).

| # | Consulta | Chamadas | Média | Máx | Total |
|---|---|---|---|---|---|
| 1 | `realtime.list_changes(...)` (walrus / Realtime) | 662.955 | 13 ms | 1.518 ms | **8.492 s ×10³** |
| 2 | `SELECT cost_usd FROM vw_org_monthly_cost_byok` | 19.089 | 220 ms | 2.104 ms | 4.198 s ×10³ |
| 3 | `SELECT ... FROM integration_events ORDER BY occurred_at DESC` | 14.652 | 271 ms | 4.276 ms | 3.967 s ×10³ |
| 4 | `SELECT ... FROM integration_inbound_events ORDER BY received_at DESC` | 14.652 | 270 ms | 3.757 ms | 3.959 s ×10³ |
| 5 | `SELECT id FROM contacts WHERE full_name ilike $2` | 442 | **8.638 ms** | 29.979 ms | 3.818 s ×10³ |
| 6 | `SELECT ... FROM opportunities WHERE title ilike $6` (+ join lateral) | 442 | **7.861 ms** | 27.512 ms | 3.475 s ×10³ |
| 7 | `DELETE FROM net._http_response` (limpeza pg_net) | 105.591 | 21 ms | 1.121 ms | 2.167 s ×10³ |
| 8 | `SELECT direction, content FROM messages WHERE thread_id = $1` | 16.322 | 91 ms | 1.316 ms | 1.482 s ×10³ |
| 9 | `INSERT INTO messages ...` | 8.584 | 128 ms | 2.590 ms | 1.095 s ×10³ |

O caminho legado do dashboard aparece bem abaixo: `opportunities` por `created_at` (146 chamadas, média 3.466 ms) e por `close_date` (109 chamadas, média 3.268 ms).

## 3. `get_sales_dashboard_stats` — tempo médio e total

| Item | Resultado |
|---|---|
| Entradas de execução em `pg_stat_statements` | **Nenhuma** (só as linhas de DDL da migração: `CREATE`, `REVOKE`, `GRANT`) |
| Chamadas via PostgREST (`rpc/get_sales_dashboard_stats`) | **0** |
| Tempo total | **0 ms** |
| Tempo médio | **n/a** |
| `pg_stat_user_functions` | vazio (`track_functions` desligado no projeto) |

Confirmação adicional: `EXPLAIN ANALYZE` do core falha com `42501 permission denied for function get_sales_dashboard_stats_core` — o isolamento aprovado está de fato ativo (o core não é chamável fora do wrapper). O `EXPLAIN ANALYZE` pedido só será possível dentro do wrapper (com sessão admin) ou concedendo execução temporária ao core, e por isso **fica pendente** — não executei nada que exigisse alteração de grant.

**Consequência:** não existe evidência de que a nova RPC tenha custado 1 ms de CPU. Provavelmente as chamadas do modo parity falharam antes de executar (erro de permissão/`ACCESS_DENIED` não é contabilizado em `pg_stat_statements`), ou o modo parity não foi aberto com usuário admin.

## 4. Modo parity executa os dois caminhos ao mesmo tempo? — SIM

Verificado em `src/pages/reports/ReportsPage.tsx`:

- `fetchData()` (linhas 208-249) roda **sempre**, com 5 consultas paginadas em `Promise.all` sobre `opportunities`.
- `useSalesDashboardStatsShadow` (linha 375) é **adicional**: recebe `ready: !loading`, ou seja só dispara **depois** que o legado terminou.

Logo, em `?parity=1` o custo é `legado + RPC`, em série (não concorrente). Sem `?parity=1`, a RPC não é chamada.

## 5. Chamadas da RPC por carregamento

O `useEffect` do hook tem deps `[organizationId, refreshKey, ownerId, ready, legacy]`.

`legacy` é o objeto `legacyShadowStats`, produzido por `useMemo([stats, openOpps, loading])` — e `stats` é outro `useMemo` que muda de identidade a cada refetch. O `console.table` é desduplicado por `refreshKey` (`loggedFor`), **mas a chamada de rede não é**: toda vez que a identidade de `legacy` muda, o efeito re-executa e faz **uma nova chamada à RPC**, sem log visível.

Contagem esperada: **1 chamada por mudança de identidade de `legacy`** (≥1 por carregamento, ≥1 por troca de período/vendedor, e mais uma a cada re-render que recrie `stats`). Não há `AbortController` na RPC — só a flag `cancelled`, que descarta o resultado mas **não cancela** a consulta no banco. Risco real de amplificação; hoje sem impacto medido porque a RPC nunca chegou a executar.

## 6. Seq Scans inesperados — aqui está o CPU

`pg_stat_user_tables` (acumulado):

| Tabela | Seq scans | Tuplas lidas em seq scan | Idx scans | Tamanho |
|---|---|---|---|---|
| `messages` | 56.964 | **13,07 bilhões** | 1,63 M | 593 MB |
| `message_threads` | 274.678 | **5,94 bilhões** | 1,31 M | 115 MB |
| `integration_events` | 29.259 | **3,56 bilhões** | 27.865 | 470 MB |
| `integration_inbound_events` | 29.255 | **2,50 bilhões** | 49.688 | 585 MB |
| `opportunities` | 211 | 2,40 milhões | 124.246 | 16 MB |
| `contacts` | 2 | 42.948 | 21,7 M | 55 MB |

Leitura:

- `integration_events` + `integration_inbound_events`: 29.259 + 29.255 seq scans ≈ **exatamente 2 × 14.652**, o número de chamadas das consultas #3 e #4. Cada chamada varre a tabela inteira e ordena (`ORDER BY occurred_at DESC` / `received_at DESC` sem índice utilizável), a 270 ms por execução. **Casam 1:1.**
- Origem dessas chamadas: `src/pages/admin/ObservabilityPage.tsx` — a única tela que lê essas tabelas, com múltiplos blocos `limit(5000)`, `limit(1000)`, `count exact head` e janelas de 1h/24h. Cada abertura/refresh dispara dezenas de varreduras.
- `messages` e `message_threads`: as maiores massas de tuplas lidas do banco. Combinam com as consultas #8 (`messages` por `thread_id`, 91 ms de média — alto demais para acesso por índice) e com o walrus do Realtime, que também exerce pressão sobre essas tabelas.
- **`opportunities` (o dashboard) é irrelevante em Seq Scan**: 211 varreduras e 2,4 M de tuplas — cinco ordens de magnitude abaixo de `messages`.

## 7. CTE reexecutada desnecessariamente

Não há evidência de CTE reexecutada dentro da nova RPC (ela não executou; o plano fica pendente conforme item 3). O padrão de reexecução observável é do PostgREST: `WITH pgrst_source AS (...) SELECT ... FROM (SELECT * FROM pgrst_source)` — envelope normal, não é reexecução.

O desperdício real é de outra natureza: **a mesma consulta pesada repetida milhares de vezes** (19.089 × `vw_org_monthly_cost_byok`, 14.652 × cada tabela de eventos), não uma CTE avaliada duas vezes.

## 8. Suspeitos do pico de 100% durante os testes

Em ordem de probabilidade, com base no acumulado e no volume por chamada:

1. **`ObservabilityPage` (admin)** — as duas varreduras completas de `integration_events` / `integration_inbound_events` (470 MB + 585 MB) a 270 ms cada, mais os blocos `limit(5000)`. É o padrão que mais claramente satura CPU quando alguém deixa a tela aberta/recarregando durante testes.
2. **`vw_org_monthly_cost_byok`** — 19.089 chamadas a 220 ms; view agregada consultada em loop.
3. **Buscas `ilike` sem índice trigram** — `contacts.full_name ilike` (8,6 s de média, pico 30 s) e `opportunities.title ilike` (7,9 s, pico 27,5 s). Poucas chamadas, custo brutal cada uma; qualquer digitação em campo de busca durante os testes gera picos.
4. **Realtime `list_changes`** — maior total absoluto (8,5 × 10⁶ ms), custo constante de fundo proporcional ao WAL de `messages`.
5. **Caminho legado do `/dashboards`** — 5 consultas paginadas por carregamento, 3,3-3,5 s por página. Contribui, mas com 146/109 chamadas está longe de ser o dominante.

Cron ativo relevante para o ruído de fundo: `integration-worker` (30 s), `intelligence-worker-30s` (30 s), `outbox-reaper` (1 min), `telephony-warm-all` (1 min), `intelligence-backfill-tick` (2 min) — 19 jobs ativos no total.

## Pendências desta auditoria (não executadas por serem intrusivas)

- `EXPLAIN ANALYZE` da nova RPC: exige sessão admin através do wrapper ou grant temporário no core. Peço autorização explícita antes.
- Atribuição do pico ao minuto exato: `pg_stat_statements` está sem `stats_reset`, e a consulta aos logs Postgres da última janela voltou vazia. Para amarrar horário ao consumidor seria necessário amostragem contínua de `pg_stat_activity` durante um novo teste.

## Nada foi alterado

Zero DDL, zero DML, zero mudança de grant, RLS, policy, índice ou código.
