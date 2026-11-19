# Rodada 2 — Lote 1: Equipe & Permissões (levantamento, somente leitura)

Nada foi alterado no Web nem no banco. Este documento é o contrato de leitura. Ao aprovar, não implemento nada: ele só fica registrado.

## 1. Escopo (o mais importante)

**A lista de pessoas NÃO respeita o escopo do RBAC v2.** Qualquer membro ativo da organização lê a organização inteira. Nenhuma das 4 tabelas olha `permissions_v2` no SELECT.

| Tabela | Policy de SELECT | Quem lê |
|---|---|---|
| `user_organizations` | `organization_id = ANY(current_user_org_ids())` (+ outra policy pelo legado `can_manage_users`) | qualquer membro ativo: **todos os vínculos, ativos e inativos** |
| `users` | o próprio registro; membros **ativos** da mesma org; ou todos da org se tiver legado `can_manage_users` | colegas ativos para todos; inativos só para admin pelo legado |
| `teams` / `team_members` | `organization_id = ANY(current_user_org_ids())` | qualquer membro ativo |
| `permission_profiles` | `user_has_org_access(organization_id)` | qualquer membro ativo, com o jsonb completo |

- Quem tem `administracao.usuarios = false` e abre a rota **recebe linhas, não vazio**. As rotas `/settings/users`, `/settings/teams` e `/settings/permissions` não têm guarda própria. Só a gravação é protegida (`can_manage_teams`, `can_manage_permission_profiles`, a função `create-user`).
- Efeito colateral: para um não-admin, os inativos chegam em `user_organizations` com `users = null`. O Web descarta essas linhas com `filter(m => m.users)`. Quem é admin pelo legado vê os inativos com nome.
- A leitura direta não passa por RPC SECURITY DEFINER. Passam por ela só:
  - `is_org_system_admin(_org)`: devolve um booleano e só decide o que o Web mostra.
  - `rpc_inactive_members_portfolio_v1` e `rpc_user_portfolio_summary_v1`: ver o item 2.
- Comparando com o caso dos 19.558 contatos: aqui não há divergência entre Web e app, porque os dois leem a org inteira. Se o app ler as mesmas tabelas, ele herda exatamente o que o Web expõe. **Recomendação (não executada):** no app, abrir as três telas só para quem tem `administracao.usuarios = true` ou perfil de sistema. É a mesma regra que libera a gravação no Web. A RLS sozinha não impede a leitura.

## 2. Usuários

- **Fonte:** tabela `user_organizations`, sem view nem RPC:
  `select('id, user_id, is_active, permission_profile_id, users(full_name, email, first_name, last_name, avatar_url), permission_profiles(name)').eq('organization_id', org)`
- **Colunas:**
  - `user_organizations`: `id` uuid NN, `user_id` uuid NN, `permission_profile_id` uuid NN, `is_active` boolean nullable (padrão true).
  - `users`: `full_name`, `email`, `first_name`, `last_name`, `avatar_url` (todas texto; nulabilidade a confirmar em `users` [INCERTO]).
  - Perfil: `permission_profiles.name` text NN.
  - Equipe: vem de uma consulta separada (item 3) e só aparece com o RBAC v2 ligado.
  - **Último acesso: o Web não exibe** e não existe coluna lida nessa tela.
  - **Foto:** `avatar_url` é lida, mas a tabela mostra apenas Nome, Email, Perfil, Equipes e Status.
- **Status:** vem só de `is_active` (Ativo/Inativo). Convite pendente não é um status de membro.
- **Ordenação, busca e paginação:** não há. Sem `order` (o banco devolve na ordem que quiser), sem busca e sem limite (cabe no teto de 1000). Existe apenas o filtro Todos/Ativos/Inativos, aplicado no próprio Web.
- **`rpc_user_portfolio_summary_v1(p_organization_id uuid, p_user_id uuid) → jsonb`**:
  - Formato: `{ "contacts": n, "threads": n, "opportunities": n }`.
  - O que conta: contatos não excluídos dos quais a pessoa é dona; conversas não mescladas, fora de resolved/closed e atribuídas a ela; oportunidades abertas e não excluídas das quais ela é dona.
  - Só para perfil de sistema: qualquer outro recebe o erro `forbidden` (42501).
  - Hoje é usada apenas no diálogo de transferir carteira.
- **Convites:** ficam numa seção separada, acima da lista: "Convites Pendentes (n)", com as colunas Email, Perfil e Data do Convite.
  - Fonte: `invitations` com `status='pending'`, mais recentes primeiro.
  - A policy de `invitations` é ALL para qualquer membro ativo. Isso já foi apontado na auditoria anterior.

## 3. Equipes

- **`teams`:** `id` uuid, `organization_id` uuid, `name` text NN, `created_at`, `updated_at`.
- **`team_members`:** `team_id`, `user_id`, `organization_id` (todos uuid NN), `created_at`.
- **Como o Web monta:** três consultas em paralelo, juntadas no próprio Web:
  - `teams` (id, name), ordenada por nome;
  - `team_members` (team_id, user_id);
  - `user_organizations` ativos com `users(full_name, email)`.
- **Líder ou gestor:** não existe coluna para isso. O "líder" é apenas um modelo de perfil com escopo "Equipe". Uma pessoa pode estar em várias equipes.

## 4. Perfis de Permissão

- **Colunas:** `id`, `organization_id`, `name` NN, `is_system` boolean NN (padrão false), `permissions` jsonb (legado), `permissions_v2` jsonb nullable, `created_at`, `updated_at`.
- **Formato de `permissions_v2`:**
```text
{ dados: {
    contatos|oportunidades: { ver, editar, excluir, exportar, atribuir: Scope, criar: bool, sem_responsavel: bool },
    conversas_comerciais|atendimentos: { ver, editar, excluir, atribuir: Scope, sem_responsavel: bool },
    chamadas: { ver, exportar: Scope },
    tarefas: { ver, editar, excluir, atribuir: Scope, criar: bool },
    classificacoes: { ver: Scope } },
  ferramentas: { tel_realizar, tel_receber, tel_transferir, rodizio, wa_enviar, wa_ativa,
                 importar, marketing, relatorios, ia, classificar, liberar_correcao,
                 certificar_classificacao, reabrir_oportunidade, corrigir_motivo_perda: bool },
  administracao: { usuarios, config, distribuicao, config_atendimento, integracoes, telefonia,
                   cobranca, auditoria, ver_numeros_classificacao, calibrar_classificacao,
                   publicar_calibracao: bool } }
Scope = "nenhum" | "meus" | "equipe" | "todos"
```
- Se `permissions_v2` for nulo, o Web converte a partir de `permissions` (`fromLegacy`) e completa com `withDefaults`. O app precisa repetir essa regra ou tratar nulo como "Nenhum".
- Itens de classificação só aparecem quando o módulo `process_classification` está ligado na org. Itens marcados como ocultos (exportar, importar, ia, auditoria) não aparecem.
- **Perfil de sistema:** selo "Sistema" com cadeado e o texto "Acesso total. Não pode ser alterado nem excluído." Os perfis personalizados mostram um resumo de Contatos, Oportunidades e Conversas comerciais, mais "n usuário(s)".
- **Quantidade por tenant:** no máximo 5 (Central), na maioria 2 ou 3, sempre 1 de sistema. Cabe tudo em uma tela, sem paginação.

## 5. Textos exatos do Web

- **Títulos:**
  - "Usuários & Permissões", com o subtítulo "Gerencie usuários e suas permissões"
  - "Equipes"
  - "Perfis de Permissão", com o subtítulo "Defina o que cada perfil vê e faz: só os próprios registros, os da equipe ou todos."
- **Status:** "Ativo", "Inativo". Filtros: "Todos", "Ativos", "Inativos". Contador: "Membros (n)" ou "Membros (x de n)".
- **Estados vazios:** "Nenhum usuário", "Nenhum usuário ativo", "Nenhum usuário inativo", "Nenhuma equipe criada.", "Sem membros", "Sem perfil". Sem equipe: "—".
- **Descrição de Equipes:** "Quem tem acesso "Equipe" vê os registros das pessoas das suas equipes. Uma pessoa pode estar em mais de uma."
- **Escopos:** Nenhum, Meus, Equipe, Todos.
- **Abas do perfil:** Dados, Ferramentas, Administração.
- **Objetos de Dados** (nome, subtítulo e ações):
  - Contatos ("Pessoas e empresas"): Ver, Criar, Editar, Excluir ("Envia para a lixeira"), Atribuir ("Trocar o responsável"); marcação "Inclui contatos sem responsável".
  - Oportunidades ("Kanban e negócios"): Ver, Criar, Editar ("Inclui mover no Kanban"), Excluir, Atribuir; marcação "Inclui oportunidades sem responsável".
  - Conversas comerciais ("Comercial"): Ver, Responder, Encerrar, Atribuir; marcação "Inclui conversas sem responsável".
  - Atendimentos ("Atendimento"): Ver, Responder, Encerrar, "Atribuir, assumir e escalar"; marcação "Vê e puxa da fila (sem responsável)".
  - Chamadas ("Histórico e gravações"): Ver.
  - Tarefas: Ver, Criar, "Editar e concluir", Excluir, Atribuir.
  - Classificações de processos ("Faixa, comissão e respostas"): Ver ("Relatório: Equipe ou Todos").
- **Ferramentas:** Realizar chamadas, Receber chamadas, Transferir chamadas, Participar do rodízio de leads, Enviar mensagens, Iniciar conversa com template, Marketing, Relatórios, Classificar processo, Liberar correção de classificação, Certificar classificação (após a entrevista), Reabrir oportunidade ganha ou perdida, Corrigir motivo de perda.
- **Administração:** Usuários e equipes, Configurações, Distribuição de leads, Configurações do Atendimento, Integrações, Telefonia, Cobrança, Ver números da classificação, Calibrar classificação, Publicar calibração.
- **Nomes de perfil de sistema:** o nome é editável. A identificação vem de `is_system`, nunca do texto "Admin".

## 6. O que não levar para o app

- **Tamanho da carteira:** o Web não mostra esse número como informação. Ele só serve para mostrar ou esconder "Transferir carteira" em inativos (`rpc_inactive_members_portfolio_v1`) e para o diálogo de transferência (`rpc_user_portfolio_summary_v1`). Além disso, a RPC responde `forbidden` para quem não é perfil de sistema. **Recomendo não portar.**
- **"n usuário(s)" por perfil:** é contado no próprio Web a partir de `user_organizations` ativos e existe para apoiar a exclusão de perfil. Como informação é inofensivo; levar ou não fica a seu critério.
- **Seletor de perfil na linha e botões Desativar/Ativar:** são ações; no app, mostrar só o nome do perfil.

## Pendências [INCERTO]
- A nulabilidade das colunas de `users` não foi consultada.
- A ordem da lista de usuários no Web é indefinida. O app deveria ordenar por nome, mas isso não é o que o Web faz hoje.
