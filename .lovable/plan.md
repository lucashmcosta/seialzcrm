# Usuários inativos invisíveis + logout imediato ao desativar

Duas questões distintas, ambas confirmadas por leitura de código e do banco.

## 1. Por que os inativos não aparecem na aba "Inativos"

Confirmado: a Central Trabalhista tem **7 vínculos inativos** e 20 ativos no banco, mas a aba "Inativos" fica vazia.

A causa não é o filtro da tela (ele está correto). É a política de leitura da tabela `users`:
ela só permite ver o cadastro de outro membro quando **os dois vínculos são ativos**
(`uo1.is_active = true AND uo2.is_active = true`). Ao desativar alguém, o vínculo continua
visível, mas o nome/e-mail dessa pessoa deixa de ser legível — e a tela descarta qualquer
linha sem dados de usuário. Resultado: a pessoa "desaparece" em vez de migrar para Inativos.

Correção mínima: ajustar a política de SELECT de `users` para que quem administra a
organização (mesma checagem canônica já usada em `current_user_managed_org_ids()`) veja
também os membros inativos da própria organização. Nada muda para usuários comuns, e
continua sem qualquer acesso entre organizações.

## 2. Ao desativar, a pessoa perde o acesso na hora?

Hoje: **parcialmente**.

- Os dados são cortados imediatamente: todas as políticas usam `current_user_org_ids()`,
  que exige `is_active = true`. No primeiro request seguinte à desativação a pessoa passa a
  não ver nada (listas vazias / erros de permissão).
- Mas a **sessão continua aberta**: o app só verifica o vínculo no carregamento inicial
  (`OrganizationContext`). Quem já estava com a aba aberta segue "dentro" do CRM, com uma
  tela quebrada, até recarregar a página.
- Existe um monitor de sessão (`useSingleSession`) escrito, mas ele **não está montado em
  nenhum lugar** do app — ou seja, não há nenhuma verificação periódica hoje.

Proposta para "deslogar na hora":

1. **Guarda de vínculo ativo no app**: um hook montado no shell autenticado que verifica o
   vínculo do usuário logado (assinatura realtime na própria linha de `user_organizations`
   + verificação periódica como rede de segurança). Ao detectar `is_active = false`, executa
   `signOut()` e redireciona para `/auth/signin` com um aviso claro ("Seu acesso foi
   desativado"). Latência esperada: imediata via realtime; poucos segundos no fallback.
2. **Revogação de refresh token no servidor** (fecha o caso de aba fechada/celular em
   background): ao desativar, o app chama uma Edge Function com service role que revoga os
   tokens do usuário, para que nem um refresh silencioso reative a sessão. Segue o padrão da
   função `create-user` já existente (validação de JWT + permissão `can_manage_users` na
   organização antes de qualquer ação privilegiada).

Ponto de decisão para a etapa 2: o token de autenticação é global (uma conta pode pertencer
a mais de uma organização). Revogar tokens desloga a pessoa de **todas** as organizações em
que ela participe, não só da Central. Hoje, na prática, cada conta está em uma única
organização, então o efeito colateral é nulo — mas vale confirmar antes de eu implementar
essa parte.

## Detalhes técnicos

- Migração: substituir a policy `Users can view members of same organization` em
  `public.users` por versão que adiciona `OR id IN (select uo.user_id from user_organizations uo
  where uo.organization_id = ANY(current_user_managed_org_ids()))`. Sem novos grants, sem
  mudança em `user_organizations`.
- Frontend: novo hook `useMembershipGuard` (canal realtime em `user_organizations` filtrado
  por `user_id`, + checagem a cada 60s), montado no layout autenticado. Toast + `signOut()`
  + redirect.
- Edge Function `revoke-user-sessions` (verify_jwt em código, valida `can_manage_users` na
  organização alvo) chamada por `UsersSettings.toggleStatus` apenas na desativação; falha na
  revogação não bloqueia a desativação (apenas registra aviso).
- Sem alteração em schemas reservados (`auth`, `storage`, etc.) via SQL — a revogação usa a
  Admin API.

## Escopo

Etapa 1 (visibilidade dos inativos) e etapa 2.1 (guarda no app) são seguras e independentes.
Etapa 2.2 (revogação de token) só entra com sua confirmação sobre o efeito multi-organização.
