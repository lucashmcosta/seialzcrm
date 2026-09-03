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

O `- 1 ms` no fallback de `prev_from` preserva a duração efetiva de hoje: a janela inclusiva atual `[p_from-1ms-dur, p_from-1ms]` e a nova exclusiva `[p_from-1ms-dur, p_from)` cobrem exatamente o mesmo conjunto. Nada além de `created_prev` e `won_prev` muda.
2. **Migração — wrapper.** `CREATE OR REPLACE` de `get_home_dashboard_stats` com os mesmos 4 parâmetros `DEFAULT NULL` no final, apenas repassados ao core. Toda a lógica de identidade/membership/`view_all_opportunities`/escopo forçado permanece intocada.
3. **Overload.** Como ambas as funções ganham parâmetros novos, `CREATE OR REPLACE` cria assinatura nova e mantém a antiga → seria overload ambíguo (todos os novos têm default). Por isso a migração faz `DROP FUNCTION` das assinaturas atuais e `CREATE` das novas na mesma transação, reaplicando os grants: wrapper `EXECUTE` para `authenticated` e `service_role`; core sem `EXECUTE` para `authenticated`/`anon`.
4. **Frontend.** `useHomeDashboardStats` passa a aceitar `previousRange?: { from, toExclusive } | null` e envia os 4 parâmetros (ou `null`). `Dashboard.tsx` calcula com a função já existente e validada `computeExplicitPreviousRange(preset, { from, to })` de `src/lib/report-period.ts`, que retorna janela explícita só para `this_week` e `this_month` (com clamp de fim de mês) e `null` para todos os outros presets e `custom`.
5. **Sem mudança** em RLS, policies, índices, KPIs, status, trend, modal, mobile (`MobileDashboard`), textos ou cores.

## Validação após implementar

Com **Esta semana** e os mesmos filtros de `/dashboards`, a Início deve mostrar: Criadas ≈ ↓ 3,6%, Ganhas ≈ ↓ 15,4%, Conversão ≈ ↓ 12,3%. Confirmar também: uma única assinatura de cada função, `authenticated` executando o wrapper e sem acesso ao core, e demais presets com deltas inalterados. Typecheck e build.
