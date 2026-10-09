# Etapa 1 — continuação (A2 verificação → B7)

Execução contínua até o fim, parando só nas condições de parada do documento ou em verificação que falhe (revertendo o item antes). Tudo registrado em `docs/platform/security/rbac-v2/etapa1-log.md`.

## 1. Antes de seguir

1. **Verificação do A2** (SQL simulando usuários reais, em transação revertida ao final, sem alterar dados):
   - Admin de uma org cria, edita e exclui um perfil comum.
   - Não-Admin (mesmo com gerenciar usuários/configurações) não grava em perfis.
   - Perfil Admin não pode ser renomeado nem excluído, nem por Admin.
   - Assistente de IA (BYOK): `has_org_role(admin)` continua verdadeiro para o Admin.
   - Se falhar: aplica `rollback/A2.sql` e para.
2. **Seed de is_system:** registrar no log que a marcação automática só ocorre quando a org ainda não tem nenhum perfil de sistema; teste simulado confirma que um perfil "Admin" criado depois não vira perfil de sistema.
3. **A0 (c) completo:** tabela no log com cada tela/função que altera `users` e `organizations`, colunas e quem dispara (web, mobile, Edge Functions, funções do banco). Base para o A3 e o A5.
4. **Conversas com business_context nulo:** contadas em todas as orgs e registradas; tratadas como `sales` (Conversas comerciais) no A9 e na Parte B, sem alterar os dados.

## 2. Parte A restante

A3 → A9 conforme o plano aprovado, com a regra de triggers (liberar service_role e funções internas), listando antes de cada trigger as funções internas que alteram aquelas colunas.

## 3. Parte B

B1 → B7 conforme o plano aprovado. B7 só liga para todos se toda a Parte A e o B6 passarem e a comparação antes/depois bater 100%; senão desliga e para.

## Detalhes técnicos

- Simulação: `set local role authenticated` + `request.jwt.claims` com `sub` de usuários reais, dentro de transação com `ROLLBACK`.
- Nulo como `sales`: `coalesce(business_context, 'sales')` nas regras novas e na RPC, sem overload novo.
