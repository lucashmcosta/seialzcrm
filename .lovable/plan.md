# Auditoria — lentidão da tela /dashboards (ReportsPage)

## O que a tela faz hoje

`src/pages/reports/ReportsPage.tsx` carrega **linha por linha** todas as oportunidades e calcula os KPIs no navegador:

- 5 buscas paginadas simultâneas via `fetchAllPagedRows` (páginas de 1000): criadas no período atual, fechadas no período atual, criadas no período anterior, fechadas no período anterior e todas as abertas (sem filtro de data).
- Dedupe no client (`dedupeRowsById`) e cálculo dos KPIs em `useMemo`.
- Mais `useServiceStats` (RPC agregada — essa parte já está correta).

Para a Central Trabalhista isso significa baixar ~13.7k oportunidades (3.2k abertas) em várias requisições sequenciais por página, a cada troca de período/filtro.

## Causa raiz medida

Duas causas somadas, ambas confirmadas por medição:

1. **RLS avaliada linha a linha.** A policy de SELECT de `opportunities` chama `user_can_view_all(organization_id, 'opportunities')` — como recebe uma **coluna** como argumento, o Postgres executa a função (plpgsql, que consulta `organizations` + `user_organizations`) **uma vez por linha**, e `current_user_id()` também. Medição na Central: só o filtro da policy custou **1.288 ms para 13.706 linhas**, sem retornar nada. Multiplicado por 5 consultas × N páginas, é o gargalo dominante.

2. **Volume transferido.** `pg_stat_statements` confirma as consultas exatas da tela entre as mais lentas do projeto:
   - `opportunities ... status = open` (paginada): média **6.576 ms**, máx 11.849 ms.
   - `opportunities ... created_at >= .. <= ..`: média **2.300 ms**, máx 3.714 ms.
   - `contacts (id, full_name) order by full_name` (lista de filtros): média **5.434 ms**.

Os índices necessários já existem (`idx_opportunities_org_status`, `idx_opportunities_org_close_date`), então **não é falta de índice** — é arquitetura de leitura.

## Correção proposta (em duas frentes, aditivas)

### A. Agregar no banco em vez de no navegador
Criar uma RPC `get_reports_dashboard_stats(p_org, p_from, p_to, p_owner, p_stage)` (`SECURITY DEFINER`, `STABLE`, validando a associação do chamador à organização no início) que devolve numa única chamada:

- criadas / ganhas / perdidas / abertas e valores somados, no período atual **e** no período anterior;
- distribuição por estágio do pipeline;
- distribuição por responsável;
- série temporal diária de criadas e ganhas.

O frontend passa a consumir esse único payload (dezenas de linhas em vez de dezenas de milhares). `ReportsPage` mantém a mesma UI e os mesmos cards; muda apenas a origem dos números. As buscas paginadas atuais são removidas depois de o novo caminho bater os mesmos valores.

### B. Tornar a RLS de `opportunities` cacheável (opcional, alto ganho global)
Reescrever a policy de SELECT para forçar avaliação única (InitPlan), no padrão já usado no projeto:

```sql
using (
  is_admin_user()
  or (
    organization_id = any (current_user_org_ids())
    and deleted_at is null
    and (
      organization_id = any (current_user_view_all_org_ids('opportunities'))
      or owner_user_id = current_user_id()
    )
  )
)
```

com uma função `current_user_view_all_org_ids(text)` sem argumento de coluna (retorna o array de orgs onde o usuário tem `view_all_<entidade>`). Isso elimina a chamada por linha e acelera **também** o Kanban de oportunidades, a busca por título e a lista de contatos — que aparecem no topo das consultas lentas com médias de 11–12 s.

## Validação

1. Antes/depois com `EXPLAIN (ANALYZE, BUFFERS)` nas mesmas consultas.
2. Comparar cada KPI da tela (valor por valor, período atual e anterior) entre o caminho antigo e o novo antes de remover o antigo.
3. Conferir isolamento multi-tenant: usuário de outra organização recebe erro/zero na RPC; usuário sem `view_all_opportunities` em org com registros privados continua vendo só os próprios.

## Escopo e ordem sugerida

- Passo 1: RPC agregada + fiação em `ReportsPage` (ganho imediato, sem tocar em RLS).
- Passo 2: reescrita da policy de `opportunities` (ganho global, exige validação de permissões dedicada).

Nada foi alterado nesta etapa — auditoria somente leitura.
