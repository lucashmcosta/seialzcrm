# Delta de "Perdidas" em /dashboards

## Auditoria (feita agora, leitura no banco vivo)

- `get_sales_dashboard_stats_core` **não** contém `lost_count_prev` (busca em `pg_proc.prosrc` retornou 0).
- A CTE `prev_closed` **já existe** e já respeita a janela anterior corrigida (`b.prev_from_day` / `b.prev_to_day`, com `COALESCE` dos parâmetros explícitos de `this_week` / `this_month`).
- `won_count_prev` já é calculado exatamente como `(SELECT count(*) FROM prev_closed WHERE status = 'won')` — o novo campo é o espelho disso com `'lost'`.
- Assinaturas atuais (11 args cada) confirmadas para wrapper e core; `authenticated` executa só o wrapper.
- Frontend: `ReportsPage` já expõe `lostCount`/`lostValue`; `KpiCard` colore delta com regra fixa (subiu = verde).

## Alteração mínima

**1. SQL (uma migração, sem overload)**
- `CREATE OR REPLACE FUNCTION get_sales_dashboard_stats_core(...)` com a **mesma assinatura de 11 args** — nenhum parâmetro novo, então não há overload nem ambiguidade e os GRANTs permanecem.
- Adicionar uma única linha na CTE `agg`:
  `(SELECT count(*) FROM prev_closed WHERE status = 'lost') AS lost_count_prev`
  e incluir `lost_count_prev` no objeto `kpis` do JSON final.
- Wrapper `get_sales_dashboard_stats`: **intocado** (só repassa o JSON do core).
- Nada de RLS, policy, índice, período, permissão ou outro KPI.

**2. Tipos**
- `useSalesDashboardStats.ts`: adicionar `lost_count_prev: number` a `DashboardKpis`.

**3. ReportsPage**
- `lostCountDelta: delta(lostCount, num(k.lost_count_prev))` — mesma função `delta()` já usada em Criadas/Ganhas/Conversão.
- Passar `delta={stats.lostCountDelta}` ao card Perdidas; `lostValue` continua apenas no sublabel.

**4. KpiCard — semântica invertida**
- Nova prop opcional `invertDelta?: boolean` (default `false`, então nenhum outro card muda).
- Quando `true`: seta continua seguindo o sinal (aumentou = ↑, diminuiu = ↓), mas a cor inverte — ↑ vermelho, ↓ verde, zero neutro.
- O card Perdidas passa `invertDelta`.

Exemplo pedido: 213 atual vs 250 anterior → −14,8% → **↓ 14,8% em verde**.

## Fora do escopo
Períodos, permissões, RLS, policies, índices, `lost_value`, e qualquer outro card.
