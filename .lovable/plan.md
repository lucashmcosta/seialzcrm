## Problema

Em `src/pages/opportunities/OpportunitiesKanban.tsx` (linhas 891–909), o filtro **Responsável** dentro do diálogo "Filtros" só é renderizado quando `permissions.viewAllOpportunities` é verdadeiro. Por isso, usuários não-admin (sem essa permissão) não veem o campo — apenas admins veem.

## Mudança

Remover o gate `permissions.viewAllOpportunities && (...)` ao redor do bloco do filtro Responsável, mantendo o restante do bloco igual. A lista `users` já é carregada para qualquer usuário (via `user_organizations`, linhas 286–291), então o select funcionará para todos.

### Arquivo
- `src/pages/opportunities/OpportunitiesKanban.tsx` — desembrulhar o bloco do filtro Responsável (linhas 891–909) para que seja sempre renderizado.

## Observação

Usuários sem `viewAllOpportunities` continuam só enxergando suas próprias oportunidades (a query do backend já filtra por `owner_user_id`). Filtrar por outro responsável simplesmente retornará vazio — isso é intencional conforme pedido ("tem que aparecer pra todos"). Nenhuma lógica de permissão/visibilidade de dados é alterada.

## Checklist
- [ ] Apenas UI: remover o gate `permissions.viewAllOpportunities`
- [ ] Sem mudança em queries, RLS ou lógica de CRM
- [ ] Sem alteração no `Layout`/`AdminLayout`, padding ou tokens de cor
