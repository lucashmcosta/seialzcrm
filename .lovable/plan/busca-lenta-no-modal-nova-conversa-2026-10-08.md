# Busca lenta no modal "Nova Conversa"

## O que foi verificado
- A busca em si é rápida no banco: buscar "Joao Teste" na Central (19 mil contatos) leva ~5 ms sem as regras de acesso, usando os índices de nome e telefone que já existem.
- A regra de acesso dos contatos (`Users can view contacts in their org`) chama `is_admin_user()`, `current_user_org_ids()`, `user_can_view_all(...)` e `current_user_id()` sem `(select ...)`. Com isso o Postgres pode rodar essas funções contato por contato. O filtro de texto (`ilike`) também só entra depois da regra de acesso, o que tende a fazer varrer os 19 mil contatos da organização em vez de usar o índice.
- Diagnóstico provável, ainda não confirmado com um usuário logado de verdade.

## Plano
1. **Confirmar a causa**: medir a mesma consulta como usuário logado (EXPLAIN ANALYZE com o papel `authenticated` e o usuário real) e o tempo da chamada no navegador.
2. **Correção no banco** (se confirmada): recriar a regra de SELECT de `contacts` com a mesma lógica, mas envolvendo cada função em `(select ...)`, para rodar uma vez por consulta e não por linha (regra de performance do projeto). Quem vê o quê não muda. A regra da Lixeira fica como está.
3. **Ajuste no modal**: usar só os campos que já têm índice e manter a espera de 300 ms; cancelar buscas antigas quando a pessoa continua digitando (`signal` do React Query), para não acumular requisições.
4. **Validar**: medir de novo (meta: abaixo de ~300 ms) e testar se um vendedor sem "ver todos" continua vendo só os próprios contatos.

## Detalhes técnicos
- Migration: `DROP POLICY` + `CREATE POLICY "Users can view contacts in their org"` com `(select is_admin_user()) OR (organization_id = ANY ((select current_user_org_ids())) AND deleted_at IS NULL AND ((select user_can_view_all(organization_id,'contacts'))... OR owner_user_id = (select current_user_id())))`. Observação: `user_can_view_all` depende de `organization_id` da linha; avaliar trocar por subconsulta por organização ou manter, conforme o EXPLAIN.
- Frontend: `src/components/messages/NewConversationDialog.tsx`, passar `.abortSignal(signal)` na consulta.
- Afeta Comercial e Atendimento (mesmo modal) e qualquer tela que leia contatos — melhora geral, mesmas permissões.
