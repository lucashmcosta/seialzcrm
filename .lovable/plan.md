# Auditoria READ-ONLY — tela Início (`/dashboard`) — performance e arquitetura de leitura

Nada foi alterado: sem SQL, sem RPC, sem RLS, sem frontend, sem permissões.

## 1. O que carrega a tela

| Camada | Arquivo | Papel |
|---|---|---|
| Desktop | `src/pages/Dashboard.tsx` (`fetchStats`, linhas 194-293) | única fonte de dados da tela |
| Mobile | `src/components/mobile/MobileDashboard.tsx` | caminho separado, só 4 `count exact/head` (já leve) |
| Gráfico Criadas × Ganhas | `src/components/reports/DashboardTrendChart.tsx` | recebe `opps` cru e bucketiza no `useMemo` |
| Donut Status | `src/components/reports/DashboardStatusDonut.tsx` | recebe `opps` cru e conta open/won/lost no `useMemo` |
| Período | `src/lib/report-period.ts` (`computeRange`) | preset padrão `today`, persistido em `usePersistedFilters('dashboard.preset')` |
| Vendedor | `usePersistedFilters('dashboard.ownerId')` + lista de `user_organizations` | só exibido quando `viewAllOpportunities` |

Não há hook dedicado nem React Query: é `useState` + `useEffect` disparando `fetchStats` a cada mudança de `org`, `userProfile`, `from`, `to`, `canViewAll`, `ownerId`.

## 2. Queries disparadas hoje (desktop)

Por carregamento, 4 chamadas lógicas em `Promise.all`:

1. `opportunities` **criadas** no período — `fetchAllPagedRows` (páginas de 1.000, até 200 páginas), com joins laterais `contacts:contact_id(full_name)` e `users:owner_user_id(full_name)`;
2. `opportunities` **ganhas** por `close_date` no período — também paginada, mesmos joins;
3. `count exact/head` de criadas no período anterior;
4. `count exact/head` de ganhas no período anterior.

Mais 1 query de `user_organizations` (lista de vendedores) quando o usuário tem `viewAllOpportunities`.

**Sim, existe paginação massiva de `opportunities`** — as duas primeiras chamadas baixam linhas completas.

## 3. Volume real (Central Trabalhista, medido agora)

| Período | Linhas criadas baixadas | Linhas ganhas baixadas |
|---|---|---|
| Hoje (padrão) | 111 | — |
| 7 dias | 824 | — |
| 30 dias | 4.559 | 254 |
| 90 dias | 11.006 | — |
| 365 dias | 14.763 | 976 |

Ou seja: em 90/365 dias a tela baixa 11 mil–15 mil linhas com dois joins laterais por linha. Em `pg_stat_statements` a consulta paginada de criadas (`organization_id + deleted_at is null + created_at between`) aparece com **483 chamadas, média 3.940 ms, máximo 21.501 ms**; a de `status = 'won'` com **292 chamadas, média 8.348 ms, máximo 29.484 ms**.

## 4. Onde cada número é calculado — hoje, tudo no frontend

- **Criadas / Ganhas**: laço `for` sobre as linhas deduplicadas (`Dashboard.tsx:271-281`).
- **Conversão**: `closedCount / enteredCount * 100` no render.
- **Deltas de período anterior**: únicos números já agregados no banco (`count exact/head`).
- **Status (donut)**: contagem open/won/lost no `useMemo` do componente.
- **Gráfico Criadas × Ganhas**: bucketização diária/semanal no `useMemo` do componente.
- **Modal de detalhe**: reaproveita as mesmas linhas já baixadas (`enteredOpps` / `closedOpps`), incluindo nome do contato, título, valor e responsável.

## 5. Regra de permissão vigente (precisa ser preservada literalmente)

Duas camadas somadas:

**Frontend** — `usePermissions` lê `user_organizations.permission_profile_id` → `permission_profiles.permissions`. `canViewAll = permissions.viewAllOpportunities`.
- `canViewAll = false` → `where owner_user_id = userProfile.id`, e o seletor de vendedor **não é exibido**.
- `canViewAll = true` → sem filtro de owner, ou `owner_user_id = ownerId` quando um vendedor é escolhido.

**Banco** — policy de SELECT em `public.opportunities`:
```
is_admin_user()
OR ( organization_id = ANY(current_user_org_ids())
     AND deleted_at IS NULL
     AND ( user_can_view_all(organization_id,'opportunities')
           OR owner_user_id = current_user_id() ) )
```
`user_can_view_all` é PL/pgSQL STABLE: se `organizations.private_records_enabled` **não** for true, **todos veem tudo**; se for true (caso da Central Trabalhista), depende de `view_all_opportunities` no perfil de permissão.

Outras regras a preservar: `deleted_at IS NULL`, escopo por `organization_id`, membership ativa em `user_organizations`, e `is_admin_user()` (impersonação/admin de plataforma).

Detalhe importante: **a RPC de `/dashboards` NÃO serve aqui**. O wrapper `get_sales_dashboard_stats` exige `can_manage_permission_profiles(org)` e aborta com `ACCESS_DENIED` — é admin-only por contrato. `/dashboard` é para todos os usuários.

## 6. Respostas objetivas

**Gargalo real:** o banco, pelo mesmo mecanismo já provado em `/dashboards` — `user_can_view_all` é avaliado por linha dentro da policy, sobre 11–15 mil linhas, com dois joins laterais por linha. Média medida de 3,9 s e 8,3 s nas duas consultas paginadas.

**Quanto do processamento está no frontend:** 100% das agregações exibidas (Criadas, Ganhas, Conversão, Status, gráfico), mas o custo de CPU do React é marginal — o tempo está na ida ao banco e no transporte das linhas. Os deltas são a única parte já agregada no servidor.

**Uma RPC própria resolveria?** Sim, e é a correção mínima: uma única chamada `SECURITY DEFINER`, permissão resolvida uma vez, `user_can_view_all` nunca por linha, resposta em poucos KB.

**Vale RPC própria e não reuso:** sim. O contrato de `/dashboard` é diferente (donut de status, trend Criadas × Ganhas, deltas) e o gate é diferente (não admin-only).

## 7. Contrato proposto (mínimo)

```sql
get_home_dashboard_stats(
  p_organization_id uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_from_day        date,
  p_to_day          date,
  p_owner_user_id   uuid default null,   -- null = todos (só honrado se view_all)
  p_tz              text default 'America/Sao_Paulo'
) returns json
```

Retorno:
```
kpis:   { created_count, created_count_prev, won_count, won_count_prev }
status: { open, won, lost }              -- entre as criadas no período
trend:  [{ bucket_date, created, won }]  -- diário; semanal segue agregado no front
```

Desenho de segurança, espelhando o padrão já aprovado em `/dashboards`:
- **wrapper público** `get_home_dashboard_stats` (PL/pgSQL, `SECURITY DEFINER`): resolve `current_user_id()`, exige membership ativa em `user_organizations` e **então** resolve `user_can_view_all(org,'opportunities')` **uma única vez**. Se falso, ignora `p_owner_user_id` e força o escopo ao próprio usuário — exatamente o que o frontend faz hoje. Se verdadeiro, aplica `p_owner_user_id` quando informado. Sem `can_manage_permission_profiles` aqui;
- **core privado** `get_home_dashboard_stats_core`, `LANGUAGE sql STABLE SECURITY DEFINER`, sem checagem, **sem `GRANT EXECUTE` para `authenticated`** — só o wrapper chama;
- `GRANT EXECUTE` apenas no wrapper; nenhum `GRANT` de tabela, nenhuma policy, nenhum índice, nenhuma RLS alterada.

Aritmética replicada literalmente do código atual: `close_date` comparado em `date` local (`p_from_day`/`p_to_day`), `created_at` em `timestamptz`, período anterior = mesma duração imediatamente anterior (`prevTo = from - 1ms`), conversão = `won / created * 100` com `—` quando `created = 0`, deltas com `(curr - prev) / prev * 100` e a regra de `prev = 0` já existente.

## 8. Queries que a RPC substitui

| Hoje | Depois |
|---|---|
| Paginação de criadas (até 15 mil linhas) | agregado na RPC |
| Paginação de ganhas por `close_date` | agregado na RPC |
| `count` de criadas do período anterior | agregado na RPC |
| `count` de ganhas do período anterior | agregado na RPC |
| Contagens de status no `useMemo` | bloco `status` |
| Bucketização do gráfico no `useMemo` | bloco `trend` (diário) |

Permanecem: a query de `user_organizations` (lista de vendedores) e — necessariamente — uma **consulta sob demanda** para o modal de detalhe, disparada só ao clicar no card, com `ORDER BY` explícito e `limit`, no mesmo formato já adotado em `/dashboards`. Agregados não conseguem servir a lista clicável.

## 9. Fora desta proposta

Mobile (`MobileDashboard` já usa só counts), React Query/cache, RLS, policies, índices, materialized views, e qualquer mudança de regra de negócio, filtro ou visibilidade.
