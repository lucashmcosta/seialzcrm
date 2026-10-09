# Segurança + Permissões novas com Equipes — plano de execução

Execução na ordem do documento: Parte A (A0–A9), depois Parte B (B1–B7). Uma migration por item, rollback salvo antes, verificação depois, registro no log. Parada apenas nas condições escritas ou em verificação que falhe (com reversão do item antes de reportar).

## Ajustes confirmados

1. **Pasta:** `docs/platform/security/rbac-v2/` (`etapa1-log.md`, `snapshot-antes.sql`, `rollback/<item>.sql`).
2. **Edge Functions com privilégio:**
   - Revogação ao desativar: chamável pelo Admin da organização (`is_org_system_admin`); o servidor valida que quem chama é Admin daquela org e que o alvo pertence a ela. Também aceita admin de plataforma.
   - Revogação em massa (uso único) e criação dos 4 usuários de teste: só admin de plataforma; depois de usadas, removidas e registradas no log.
   - Se exigir login no /admin, informo exatamente o que clicar e sigo com o restante enquanto isso.
3. **B7:** liga para todos sem pausa somente se toda a Parte A e o B6 passarem e a comparação antes/depois bater 100%; caso contrário `rbac_v2_set_global(false)` e paro.
4. **Triggers de proteção (A3, A4, A5, A7 e Parte B):** liberam `service_role` e também execução dentro de funções `SECURITY DEFINER` do sistema (`current_user NOT IN ('authenticated','anon')`). Antes de cada trigger, o log lista as funções internas que alteram aquelas colunas (mesclar contatos, round-robin, reatribuições etc.) e confirma que continuam funcionando.

## Parte A — Segurança (vale já para todas as orgs)

- **A0** Diagnóstico só leitura (contagens e identificadores, sem dados pessoais) e snapshot das definições atuais. Parada se houver `is_platform_admin` fora de `admin_users`.
- **A1** Backups: RLS ligado sem policies, revogar `anon`/`authenticated`. Nada é apagado.
- **A2** Perfil de sistema (`is_system`), `is_org_system_admin`, proteção do perfil Admin, `has_org_role('admin')` passa a usar `is_system`. Parada se não forem exatamente 16 perfis "Admin".
- **A3** Trigger protegendo `is_platform_admin` e colunas de sistema em `users`; link /admin depende de `admin_users`.
- **A4** Trigger em `user_organizations` (sem autoelevação, sem desativar a si mesmo, sempre ao menos um Admin ativo); ajustes na tela de Usuários e em `create-user`; revogação de sessão ao desativar.
- **A5** UPDATE em `organizations` só Admin/plataforma; colunas de cobrança/plano só sistema. RPC específica se A0 achar fluxo legítimo de não-Admin.
- **A6** `export-conversations` exige Admin da org; botão oculto para os demais.
- **A7** Lixeira de contatos/oportunidades por permissão de exclusão; exclusão definitiva só Admin; web e mobile só oferecem o que funciona.
- **A8** `security_invoker` nas 10 views.
- **A9** `rpc_list_message_threads` igual à policy de threads. Não aplicado se A0 mostrar perda de acesso (registra e segue).

## Parte B — Permissões novas com Equipes (desligada até B7)

- **B1** Flag `rbac_v2`, funções de ligar por org/global, org "Seialz Teste Permissões" com 4 usuários e dados de teste.
- **B2** Tabelas `teams` e `team_members` (com GRANTs e RLS), coluna `permissions_v2`.
- **B3** Catálogo e conversão em código e SQL com a mesma regra, testes de equivalência (26 chaves e casos do documento), backfill.
- **B4** Resolver (`my_perms_v2`, `my_team_user_ids`, `can_on_record`) e policies/RPCs com `CASE WHEN rbac_v2_enabled(org)`. Parada se contagens de 3 usuários reais mudarem.
- **B5** Telas: perfis (lista, novo, editor por abas, excluir com destino, modelos prontos), Equipes, coluna Equipes em Usuários, menus e guardas de rota reais.
- **B6** Testes na org de teste conforme roteiro.
- **B7** Foto antes, backfill, ligar global, foto depois; desliga automaticamente se qualquer número/menu divergir.

## Fora de escopo

Mensageria, composer, dispatcher, webhooks e telefonia não mudam de comportamento; só passam a ser verificados. Feature de edição de mensagens e widgets intocados.

## Detalhes técnicos

- Regras do projeto respeitadas: `current_user_id()` (nunca `auth.uid()` em relacionamentos), `organization_id = ANY(current_user_org_ids())` em tabelas volumosas, funções `SECURITY DEFINER` com `search_path = public`, sem overloads de RPCs usadas pelo app nativo (`rpc_list_message_threads` mantém assinatura única).
- Triggers de proteção liberam `service_role` via `auth.role()`/`current_setting('request.jwt.claims')`.
- Verificações por SQL simulando usuários com `set local role authenticated` + `request.jwt.claims` em transação somente leitura.
- Mobile publicado: nenhuma RPC muda de assinatura; colunas novas são opcionais.
