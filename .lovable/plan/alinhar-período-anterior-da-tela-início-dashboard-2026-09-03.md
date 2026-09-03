# Alinhar período anterior da tela Início (/dashboard)

## Auditoria (read-only, feita agora)

Assinaturas atuais no banco — uma única de cada, sem overload:

- `get_home_dashboard_stats(p_organization_id uuid, p_from timestamptz, p_to timestamptz, p_from_day date, p_to_day date, p_owner_user_id uuid DEFAULT null, p_tz text DEFAULT 'America/Sao_Paulo')` — plpgsql, STABLE SECURITY DEFINER. Valida identidade (`current_user_id()`), membership ativa e resolve `v_is_admin` uma única vez por `permissions->>'view_all_opportunities'`; Admin honra `p_owner_user_id`, não-Admin é forçado a si mesmo.
- `get_home_dashboard_stats_core(... , p_view_all boolean, p_self_user_id uuid, p_tz text)` — sql, sem checagem de permissão, acessível só via wrapper.

Cálculo atual do período anterior no core (CTE `bounds`), puramente por duração:

```text
prev_to      = p_from - 1 ms
prev_from    = prev_to - (p_to - p_from)
prev_to_day  = prev_to::date   (no fuso p_tz)
prev_from_day= prev_from::date
```

`created_count_prev` = contagem de `created_at` entre `prev_from` e `prev_to` (inclusivo);
`won_count_prev` = `status='won'` com `close_date` entre `prev_from_day` e `prev_to_day` (inclusivo).

É exatamente essa janela por duração que faz os deltas da Início divergirem de `/dashboards`, que já aceita janela anterior explícita (`p_prev_from/p_prev_to/p_prev_from_day/p_prev_to_day`, com `COALESCE` para o comportamento antigo e limite superior **exclusivo**).

## Plano mínimo

1. **Migração — core.** `CREATE` de `get_home_dashboard_stats_core` com 4 parâmetros novos ao final, todos `DEFAULT NULL`: `p_prev_from timestamptz`, `p_prev_to timestamptz`, `p_prev_from_day date`, `p_prev_to_day date`. A CTE `bounds` é normalizada para **fim exclusivo em todos os casos**, igual a `/dashboards`:

```sql
prev_to       = COALESCE(p_prev_to,       p_from)
prev_from     = COALESCE(p_prev_from,     p_from - (p_to - p_from) - interval '1 millisecond')
prev_to_day   = COALESCE(p_prev_to_day,   p_from_day)
prev_from_day = COALESCE(p_prev_from_day, ((p_from - (p_to - p_from) - interval '1 millisecond') AT TIME ZONE p_tz)::date)
```

`created_prev`: `created_at >= prev_from AND created_at < prev_to`.
`won_prev`: `status='won' AND close_date >= prev_from_day AND close_date < prev_to_day`.

O `- 1 ms` no fallback de `prev_from` preserva a duração efetiva de hoje. Como `timestamptz` tem precisão de microssegundos, `created_at <= p_from - 1ms` e `created_at < p_from` não são conjuntos idênticos em teoria (linhas nos 999 µs entre os dois limites entrariam só na nova janela). Verificação read-only nos dados vivos (referência 03/09/2026, `deleted_at IS NULL`, todas as organizações) confirmou ausência de drift atual:

| preset | janela antiga | janela nova exclusiva |
|---|---|---|
| `last_7` | 1.062 | 1.062 |
| `last_30` | 5.202 | 5.202 |
| `last_90` | 7.283 | 7.283 |

Para `close_date` (tipo `date`) o desenho novo `>= prev_from_day AND < prev_to_day` com fallback `prev_to_day = p_from_day` é exatamente equivalente ao inclusivo de hoje. Nada além de `created_prev` e `won_prev` muda.
2. **Migração — wrapper.** `CREATE OR REPLACE` de `get_home_dashboard_stats` com os mesmos 4 parâmetros `DEFAULT NULL` no final, apenas repassados ao core. Toda a lógica de identidade/membership/`view_all_opportunities`/escopo forçado permanece intocada.
3. **Overload.** Como ambas as funções ganham parâmetros novos, `CREATE OR REPLACE` cria assinatura nova e mantém a antiga → seria overload ambíguo (todos os novos têm default). Por isso a migração faz `DROP FUNCTION` das assinaturas atuais e `CREATE` das novas na mesma transação, reaplicando os grants: wrapper `EXECUTE` para `authenticated` e `service_role`; core sem `EXECUTE` para `authenticated`/`anon`.
4. **Frontend.** `useHomeDashboardStats` passa a aceitar `previousRange?: { from, toExclusive } | null` e envia os 4 parâmetros (ou `null`). `Dashboard.tsx` calcula com a função já existente e validada `computeExplicitPreviousRange(preset, { from, to })` de `src/lib/report-period.ts`, que retorna janela explícita só para `this_week` e `this_month` (com clamp de fim de mês) e `null` para todos os outros presets e `custom`.
5. **Sem mudança** em RLS, policies, índices, KPIs, status, trend, modal, mobile (`MobileDashboard`), textos ou cores.

## Prova por exemplo (referência 03/09/2026, fuso America/Sao_Paulo)

**`last_30` — resultado idêntico ao de hoje.** Atual: `p_from = 05/08 00:00:00.000`, `p_to = 03/09 23:59:59.999`, `p_from_day = 05/08`, duração = 29d 23:59:59.999.

| | hoje (inclusivo) | novo (exclusivo) |
|---|---|---|
| `created_prev` | `[06/07 00:00:00.000 , 04/08 23:59:59.999]` | `[06/07 00:00:00.000 , 05/08 00:00:00.000)` |
| `won_prev` (dias) | `06/07 … 04/08` | `06/07 … 05/08)` = `06/07 … 04/08` |

Mesmos conjuntos de linhas → `created_count_prev` e `won_count_prev` inalterados. Vale igualmente para `today`, `yesterday`, `last_7`, `last_90`, `last_12_months` e `custom`, que continuam enviando `NULL`.

**`this_week`** (31/08 seg → 03/09): janela explícita `24/08 00:00` a `28/08 00:00` exclusivo → dias 24–27, o mesmo trecho da semana anterior.

**`this_month`** (01/09 → 03/09): janela explícita `01/08 00:00` a `04/08 00:00` exclusivo → dias 01–03 de agosto, com clamp quando o mês anterior é mais curto.

## Validação após implementar

Com **Esta semana** e os mesmos filtros de `/dashboards`, a Início deve mostrar: Criadas ≈ ↓ 3,6%, Ganhas ≈ ↓ 15,4%, Conversão ≈ ↓ 12,3%. Confirmar também: uma única assinatura de cada função, `authenticated` executando o wrapper e sem acesso ao core, e um preset comum (`last_30`) com `created_count_prev`/`won_count_prev` idênticos aos de antes da migração. Typecheck e build.
