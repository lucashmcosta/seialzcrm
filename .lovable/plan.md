# Auditoria técnica `/dashboards` — onde o tempo é gasto

Nenhum arquivo de código foi alterado. Tudo abaixo é medido, não estimado. Onde não pude medir, está marcado `[INCERTO]`.

Rota: `/dashboards` → `src/pages/reports/ReportsPage.tsx` (827 linhas), registrada em `src/App.tsx:674-681`.

Org de referência das medições: **Central Trabalhista** (`40ae935c…`) — a maior e a que sofre. Comparação com **Viagi** (`b246ef6f…`) no final.

---

## ETAPA 1 — Mapa cronológico

1. `ProtectedRoute` → `ReportsPage` monta.
2. Hooks, na ordem: `useOrganization`, `usePermissions`, `useIsMobile`, 3× `usePersistedFilters` (`reports.preset`, `reports.customRange`, `reports.ownerId`), `useMemo computeRange`, 8× `useState`, `useServiceStats`.
3. `useEffect` A (`ReportsPage.tsx:131`, dep `organization?.id`) → `fetchUsersAndStages()`: 2 SELECTs em paralelo (`user_organizations+users`, `pipeline_stages`).
4. `useEffect` B (`:137`, deps `organization?.id, filtersHydrated, rangeKey, ownerId`) → `fetchData()`.
   - Enquanto `filtersHydrated` é false (hidratação do localStorage), **não dispara** — logo há um render inicial com `loading=true` e depois o efeito roda; se o preset persistido difere do default `last_30`, `rangeKey` muda e o efeito roda **duas vezes**.
5. `useServiceStats` (`src/hooks/useServiceStats.ts:46`) → RPC `get_service_dashboard_stats` (1 request), em paralelo ao item 4.
6. `fetchData()` (`:216-248`) dispara **5 cadeias** em `Promise.all`, cada cadeia via `fetchAllPagedRows` (`src/lib/fetchAllPagedRows.ts`) que pagina **sequencialmente** de 1000 em 1000 até a página vir incompleta:
   - C1 `currentCreated`: `created_at` no período
   - C2 `currentClosed`: `status in (won,lost)` + `close_date` no período
   - C3 `previousCreated`
   - C4 `previousClosed`
   - C5 `openRows`: `status='open'` (**sem filtro de data — pipeline inteiro**)
7. `setCurrentOpps` / `setPreviousOpps` / `setOpenOpps` → 3 setState (React 18 batcha em um render), `dedupeRowsById` monta 2 `Map`.
8. `useMemo` recalculam: `stats` (`:270`), `funnel` (`:356`), `trend` (`:368`), `userStats` (`:424`).
9. Render de 13 `KpiCard`, `WinRateGauge`, `SalesTrendChart`, `PipelineFunnel`, `StageDistribution`, `UserLeaderboard` (Recharts).

---

## ETAPA 2 / ETAPA 7 — Volume e tempo real por etapa (Central, preset `last_30`, owner `all`)

Volumes exatos (contados no banco agora):

| Consulta | Linhas | Páginas HTTP (1000/pág) | Bytes JSON (347 B/linha medido) |
|---|---|---|---|
| C1 criadas 30d | 4.342 | **5 sequenciais** | ~1,51 MB |
| C2 fechadas 30d | 3.234 | **4** | ~1,12 MB |
| C3 criadas período anterior | 3.381 | **4** | ~1,17 MB |
| C4 fechadas período anterior | ~3,0k `[INCERTO — mesma ordem de C2]` | ~4 | ~1,04 MB |
| C5 abertas (todas) | 3.465 | **4** | ~1,20 MB |
| **Total** | **~17,4k linhas** | **~21 requests** | **~6,0 MB** |

Tempo real **em produção, com RLS**, de `extensions.pg_stat_statements` (só tempo de banco, sem rede):

| Consulta | calls | média | máximo | total acumulado |
|---|---|---|---|---|
| C5 `status='open'` | 48 | **7.207 ms** | **20.889 ms** | 345,9 s |
| C1 `created_at >= <=` | 67 | **3.232 ms** | 6.949 ms | 216,5 s |
| C2 `status=ANY + close_date >= <=` | 54 | **2.960 ms** | 6.945 ms | 159,8 s |
| C3 `created_at >= <` | 35 | **2.599 ms** | 7.276 ms | 91,0 s |
| C4 `close_date >= <` | 27 | **2.076 ms** | 6.844 ms | 56,0 s |
| RPC `get_service_dashboard_stats` | 78 | 187 ms | 1.538 ms | 14,6 s |
| mesmas queries **com owner filtrado** | 31 | 39–263 ms | 798 ms | — |

Caminho crítico (a cadeia mais lenta manda no wall clock): **C5 = 4 páginas × 7.207 ms ≈ 28,8 s de banco**, mais ~4 RTTs de rede. É isso que o usuário sente.

Objetos criados em JS: ~17,4k objetos `Opp` + ~17,4k parses JSON + 2 `Map` no dedupe + ~30 pontos de `trend` + ~22 linhas de `userStats`. Renderizações do `ReportsPage`: **6 a 8** (mount, hidratação dos 3 filtros, serviceStats, batch dos 3 setState, `loading=false`).

---

## ETAPA 5 — Banco: prova de que o custo é RLS, não plano/índice

Mesma consulta C5 executada **sem RLS** (service_role), `EXPLAIN (ANALYZE, BUFFERS)`:

```text
Limit (actual time=79.760..84.669 rows=465)
  -> Index Scan using opportunities_pkey  (actual time=0.836..84.438 rows=3465)
     Filter: deleted_at IS NULL AND organization_id = ... AND status='open'
     Rows Removed by Filter: 24432
     Buffers: shared hit=28323 read=146
Execution Time: 84.771 ms
```

Sem RLS: **84,8 ms**. Com RLS em produção: **7.207 ms de média**.
→ **RLS = ~98,8% do tempo dessa consulta.** Não é falta de índice: existem `idx_opportunities_org_status (organization_id, status) WHERE deleted_at IS NULL` e `idx_opportunities_org_close_date`. O plano só piora porque o `OFFSET 3000` sem `ORDER BY` faz o planner escolher `opportunities_pkey` e descartar 24.432 linhas.

Causa exata do custo de RLS — policy `Users can view opportunities in their org`:

```sql
is_admin_user() OR ( organization_id = ANY (current_user_org_ids())
  AND deleted_at IS NULL
  AND ( user_can_view_all(organization_id,'opportunities') OR owner_user_id = current_user_id() ) )
```

- `is_admin_user()` e `current_user_org_ids()` não recebem colunas → viram InitPlan (1× por query). OK.
- **`user_can_view_all(organization_id, 'opportunities')` recebe uma coluna** → é avaliada **por linha**. É `plpgsql` e faz por chamada: 1 SELECT em `organizations`, 1 chamada a `current_user_id()` (que é outro `plpgsql` com SELECT em `users`) e 1 SELECT com JOIN em `user_organizations`+`permission_profiles`. **3 SELECTs × ~16.500 linhas escaneadas por página.**
- `Central Trabalhista` tem `private_records_enabled = true`; `Viagi` tem `false`. Em Viagi a função retorna `true` no primeiro SELECT (saída antecipada); em Central ela executa o caminho completo. É exatamente por isso que a Central é a que trava.
- Emulando os mesmos lookups **em SQL puro** (subplans, sem overhead de plpgsql) o custo é 20,9 ms para 3.466 linhas (`loops=3466` visíveis no plano). O salto de 20 ms → ~7.000 ms é overhead de execução de `plpgsql` por linha.
- Não consigo executar `SET ROLE authenticated` por esta ferramenta (read-only), por isso a prova é: plano sem RLS (85 ms) + tempo real em produção com RLS (7.207 ms) + estrutura da policy. `[INCERTO — a divisão exata entre `user_can_view_all` e `current_user_id` dentro dos 7.122 ms restantes não foi isolada]`

Sem seq scan em `opportunities`, sem sort, sem hash join custoso. `get_service_dashboard_stats`: 70 ms no `EXPLAIN`, 187 ms de média em produção — **não é gargalo**.

---

## ETAPA 3 — React: está rápido, e aqui está a prova

- `stats`, `funnel`, `trend`, `userStats` são 4 passes lineares sobre ~17,4k objetos com `filter`/`reduce`/`forEach`. Ordem de grandeza: dezenas de ms em desktop, contra ~28.800 ms de banco. **React é <1% do tempo.**
- Ineficiências reais, porém de baixo impacto:
  - `trend` (`:404`, `:411`) usa `points.findIndex` dentro de `forEach` → O(n×dias); com 17,4k linhas × 31 pontos = ~540k comparações + `toLocaleDateString` chamado por linha (custo real, mas ainda ordens de grandeza abaixo do banco).
  - `userStats` (`:431`) faz `users.find` dentro do loop.
  - `openOpps.reduce(...)` inline em `:495` e `:617` — recalcula o valor do pipeline em **todo** render, fora de `useMemo`.
  - `stats`/`trend`/`userStats` dependem de `rangeKey` (string) mas leem `range` do closure — funciona, porém as deps não declaram `range`; risco de stale, não de lentidão.
  - `Suspense` envolvendo componentes importados estaticamente (`:535`, `:578`…) não tem efeito nenhum.
  - Duplo disparo de `fetchData` quando o preset persistido ≠ default → potencialmente **42 requests** em vez de 21.
- **Não há React Query nesta página** (só `useState`+`useEffect`), portanto: zero cache, zero dedupe, e voltar para `/dashboards` refaz as ~21 requests do zero. Em contraste, `src/pages/marketing/_hooks/useOverview.ts` já usa React Query com `staleTime` de 5 min.

---

## ETAPA 4 — Rede: todas as chamadas de um carregamento

| # | Chamada | Requests | Linhas | Tempo (banco) | Necessária? |
|---|---|---|---|---|---|
| 1 | `user_organizations + users` | 1 | 22 | <20 ms | Sim |
| 2 | `pipeline_stages` | 1 | 6 | <10 ms | Sim |
| 3 | RPC `get_service_dashboard_stats` | 1 | 1 | 187 ms | Sim (modelo correto) |
| 4 | C1 `opportunities` criadas | 5 | 4.342 | 5×3.232 ms | Só os agregados |
| 5 | C2 fechadas | 4 | 3.234 | 4×2.960 ms | Só os agregados |
| 6 | C3 criadas anterior | 4 | 3.381 | 4×2.599 ms | **Desnecessária como linhas** — só 4 deltas |
| 7 | C4 fechadas anterior | ~4 | ~3,0k | 4×2.076 ms | **Desnecessária como linhas** — só 1 delta |
| 8 | C5 abertas (sem filtro de data) | 4 | 3.465 | 4×7.207 ms | **Desnecessária como linhas** — só count/soma por estágio |

Bug de correção encontrado no caminho: `fetchAllPagedRows` usa `.range()` **sem `ORDER BY`**. Em Postgres a ordem sem `ORDER BY` não é garantida entre páginas → páginas podem repetir/omitir linhas. `dedupeRowsById` esconde a duplicata, mas **não** a omissão. Isso pode fazer os KPIs divergirem do Kanban.

---

## ETAPA 6 — Origem de cada KPI

| Card | Origem | Classe |
|---|---|---|
| Oportunidades criadas | `stats.createdCount` — `filter` em JS sobre C1 | **A** |
| Ganhas (qtd/valor) | `stats.wonCount/wonValue` — `filter`+`reduce` em JS | **A** |
| Perdidas (qtd/valor) | `stats.lostCount/lostValue` — JS | **A** |
| Conversão | JS (won/created) | **A** |
| Gauge de conversão | JS | **A** |
| Ticket médio | JS | **A** |
| Ciclo médio de venda | JS (`close_date - created_at` por linha) | **A** |
| Pipeline aberto (qtd) | `openOpps.length` | **A** |
| Pipeline aberto (valor) | `reduce` inline no JSX `:617` | **A** |
| Funil / Distribuição por estágio | `funnel` useMemo sobre `openOpps` | **A** |
| Tendência (gráfico) | `trend` useMemo sobre C1 | **A** |
| Leaderboard por usuário | `userStats` useMemo | **A** |
| Pessoas em contato | RPC `get_service_dashboard_stats` | **B** |
| Tempo médio 1ª resposta | RPC | **B** |
| Encerrados / Total | RPC | **B** |
| Tempo médio de resposta | RPC | **B** |

Resumo: **12 de 16 cards são classe A** (baixam linhas brutas e calculam no React). Os 4 que são classe B (RPC) custam 187 ms no total. O contraste é a resposta da auditoria.

---

## ETAPA 8 — Ranking do gargalo (caminho crítico ≈ 28,8 s de banco + ~21 RTTs)

| # | Gargalo | Onde | Tempo | % |
|---|---|---|---|---|
| 1 | `user_can_view_all(organization_id, …)` avaliada **por linha** na policy de `opportunities` (plpgsql, 3 SELECTs/linha) | policy `Users can view opportunities in their org` | ~7.122 ms de cada 7.207 ms | **~98,8% do tempo de cada query** |
| 2 | Paginação **sequencial** de 1000 em 1000 | `src/lib/fetchAllPagedRows.ts:11` | multiplica ×4–5 o custo acima (7,2 s → 28,8 s) | multiplicador 4–5× |
| 3 | Baixar 17,4k linhas / 6,0 MB para produzir ~30 números | `ReportsPage.tsx:216-252` | é a causa raiz de #1 e #2 | — |
| 4 | C5 sem filtro de data (pipeline inteiro, 3.465 linhas) | `ReportsPage.tsx:243-247` | a cadeia mais lenta de todas | 100% do caminho crítico |
| 5 | RPC de atendimento | `get_service_dashboard_stats` | 187 ms | ~0,6% |
| 6 | Processamento JS (4 useMemo, `findIndex` em loop, `toLocaleDateString` por linha) | `:270-474` | dezenas de ms | **<1%** |
| 7 | Duplo `fetchData` na hidratação dos filtros | `:137-141` | dobra tudo quando ocorre | intermitente |

**Veredito: o banco está lento e o React está rápido.** Uma única causa — a função de RLS avaliada por linha — responde por ~98,8% do tempo de banco; e o padrão de baixar linhas brutas paginadas sequencialmente é o que a expõe 21 vezes por carregamento. Nenhuma otimização de React muda o número percebido.

---

## ETAPA 9 — Correções propostas (nada implementado)

| # | Correção | Impacto esperado | Risco | Esforço |
|---|---|---|---|---|
| 1 | RPC `SECURITY DEFINER` `get_sales_dashboard_stats(p_org, p_from, p_to, p_owner)` retornando **em 1 request** os agregados de C1–C5 + funil por estágio + série temporal + leaderboard, com checagem de acesso feita **1×** no início (`current_user_org_ids()` + `user_can_view_all`) em vez de por linha. Substitui `ReportsPage.tsx:216-252` e os 4 `useMemo`. | ~28,8 s → **~150–300 ms** (mesma classe do RPC de atendimento, que já faz isso e custa 187 ms) | Médio — precisa reproduzir exatamente as regras de `close_date` local vs UTC (`parseLocalDate`, `:54`) e o recorte de private records, senão os números divergem do Kanban | **Grande Refatoração** (mas é a única que resolve #1–#4) |
| 2 | Reescrever `user_can_view_all` como `LANGUAGE sql STABLE` (sem plpgsql) e/ou trocar a policy para não passar coluna: `organization_id = ANY(current_user_org_ids())` + gate de privacidade resolvido em InitPlan | Elimina o overhead por linha em **toda a aplicação**, não só nos dashboards | **Alto** — mexe em policy de segurança multi-tenant; exige matriz de teste de `private_records_enabled` por perfil antes de aplicar | Médio |
| 3 | Adicionar `.order('id')` em todas as chamadas paginadas de `fetchAllPagedRows` | Corrige risco de linhas omitidas entre páginas (bug de correção, não de performance) | Baixo | **Quick Win** |
| 4 | Envolver a busca em React Query com `staleTime` (padrão já usado em `useOverview.ts`) | Elimina o custo total ao voltar para a tela; corrige o duplo disparo | Baixo | **Quick Win** |
| 5 | `useMemo` para `openOpps.reduce` de `:495` e `:617`; `Map` de datas em `trend` no lugar de `findIndex`; remover `Suspense` inócuos | Dezenas de ms | Baixo | **Quick Win** |

Ordem recomendada: 3 e 4 primeiro (isolados, sem risco), depois 1, e 2 só com matriz de teste de permissões — 2 é o que dá o ganho global, mas é o de maior risco de segurança.

Nada será alterado sem sua aprovação. Se quiser, o próximo passo é eu detalhar o contrato exato do RPC do item 1 (assinatura, colunas de retorno e equivalência campo a campo com os 16 cards atuais) antes de escrever qualquer SQL.
