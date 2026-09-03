# Auditoria read-only — deltas de comparação com período anterior em `/dashboards`

Nenhuma alteração de código, SQL, RLS ou policy. Decisão registrada: **manter o comportamento atual** (nenhuma correção a implementar).

---

## 1. Fluxo completo comprovado

1. **Preset → intervalo**: `src/lib/report-period.ts` → `computeRange()`. Produz **somente o intervalo atual**. Não existe cálculo de período anterior no frontend.
2. **Frontend → RPC**: `src/hooks/useSalesDashboardStats.ts` (L94-102) envia `p_from`/`p_to` (ISO), `p_from_day`/`p_to_day` (`YYYY-MM-DD` local) e `p_tz`.
3. **Período anterior**: calculado **dentro** de `get_sales_dashboard_stats_core`, CTEs `bounds`/`b`:

```sql
GREATEST(1, round(EXTRACT(epoch FROM (p_to - p_from)) / 86400.0))::int AS days
...
p_from - make_interval(days => days) AS prev_from,
p_from                              AS prev_to,        -- exclusivo
(p_from_day - days)                 AS prev_from_day,
p_from_day                          AS prev_to_day     -- exclusivo
```

4. **Percentual**: `src/pages/reports/ReportsPage.tsx` L185-188.

O wrapper `get_sales_dashboard_stats` só faz identidade + membership ativo + `can_manage_permission_profiles`; não toca em datas.

---

## 2. Resposta à dúvida principal

Nem A nem B. O sistema faz uma **terceira coisa**: compara com os *N* dias imediatamente anteriores ao início do período atual, onde *N* é a duração **decorrida**.

Com "Esta semana" na quinta 03/09/2026:
- atual = **seg 31/08 → qui 03/09** (4 dias)
- anterior = **qui 27/08 → dom 30/08** (4 dias)

Compara Seg–Qui contra Qui–Dom da semana passada. Mesma duração, dias da semana desalinhados. Não é seg→qui da semana passada (A) nem a semana passada inteira (B).

---

## 3. Tabela por preset (referência: quinta-feira 03/09/2026)

| preset | período atual real | período anterior real | duração | correto? |
|---|---|---|---|---|
| Hoje | 03/09 00:00 → 03/09 23:59:59.999 | 02/09 00:00 → 03/09 00:00 (excl.) | 1 d / 1 d | Sim |
| Ontem | 02/09 00:00 → 02/09 23:59 | 01/09 00:00 → 02/09 00:00 | 1 d / 1 d | Sim |
| Esta semana | 31/08 (seg) → 03/09 23:59 | 27/08 → 31/08 00:00, efetivo 27–30/08 | 4 d / 4 d | **Não** — dias da semana desalinhados |
| Semana passada | 24/08 → 30/08 23:59 | 17/08 → 24/08 00:00, efetivo 17–23/08 | 7 d / 7 d | Sim |
| Este mês | 01/09 → 03/09 23:59 | 29/08 → 01/09 00:00, efetivo 29–31/08 | 3 d / 3 d | **Não** — compara com fim de agosto, não 01–03/08 |
| Mês passado | 01/08 → 31/08 23:59 | 01/07 → 01/08 00:00, efetivo julho | 31 d / 31 d | Sim (coincide) |
| Últimos 7 dias | 28/08 → 03/09 23:59 | 21/08 → 28/08 00:00, efetivo 21–27/08 | 7 d / 7 d | Sim |
| Últimos 30 dias | 05/08 → 03/09 23:59 | 06/07 → 05/08 00:00, efetivo 06/07–04/08 | 30 d / 30 d | Sim |
| Últimos 90 dias | 06/06 → 03/09 23:59 | 08/03 → 06/06 00:00 | 90 d / 90 d | Sim |
| Últimos 12 meses | 04/09/2025 → 03/09/2026 | 04/09/2024 → 04/09/2025 | 365 d / 365 d | Sim |
| Personalizado | from → to | mesma duração antes de `from` | N / N | Sim |

**"Este ano" não existe** — `PRESET_LABELS` (`src/components/reports/ReportFilters.tsx` L22-33) não tem esse preset. O mais próximo é "Últimos 12 meses".

O mecanismo é matematicamente consistente: durações sempre iguais, janela anterior fechada à esquerda e aberta à direita, sem sobreposição com o período atual. A limitação é semântica e afeta **apenas presets parciais em curso**: "Esta semana", "Este mês" e qualquer personalizado que termine hoje.

---

## 4. Cards com comparação percentual

| card | tem delta? | base do delta |
|---|---|---|
| Oportunidades criadas | Sim | `created_count` vs `created_count_prev` (por `created_at`) |
| Ganhas | Sim | `won_value` vs `won_value_prev` — o número grande é a *contagem*, mas o percentual é do *valor* (`ReportsPage.tsx` L436) |
| Perdidas | Não | — |
| Conversão | Sim | `win_rate` vs `win_rate_prev`, cada um = `won_count / created_count * 100` no seu próprio período |
| Pipeline aberto / Ticket médio / Ciclo médio | Não | sem noção de período anterior |

Escalas de data: métricas de fechamento (Ganhas/Perdidas/Conversão) usam `close_date` (tipo `date`, comparado contra `p_from_day`/`p_to_day`); Criadas usa `created_at` (`timestamptz`). O período anterior é derivado nas duas escalas com o mesmo `days`.

---

## 5. Fórmula exata do percentual

```ts
const delta = (curr: number, prev: number): number | null => {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
};
```

Exibição: `Math.abs(delta).toFixed(1)}%` — `src/components/reports/KpiCard.tsx` L50, uma casa decimal. Com `prev = 0` e `curr > 0` o retorno é `null` e o badge **desaparece** (não mostra "+∞" nem "+100%").

Exemplo do `+21,8%` com atual `134`:

```
((134 − prev) / prev) × 100 = 21,8   ⇒   prev = 134 / 1,218 ≈ 110
conferindo:  (134 − 110) / 110 × 100 = 21,818…%  →  "21.8%"
```

---

## 6. Decisão

- Presets em curso ("Esta semana" / "Este mês"): **não alterar**.
- Delta do card "Ganhas" (valor, não contagem): **manter como está**.

Nada a implementar.
