# Usuários inativos não aparecem na aba "Inativos"

## Diagnóstico (confirmado)

A Central Trabalhista tem **7 vínculos inativos** e 20 ativos no banco, mas a aba "Inativos"
fica vazia.

A causa não é o filtro da tela (ele está correto). É a política de leitura da tabela `users`:
ela só permite ver o cadastro de outro membro quando **os dois vínculos são ativos**
(`uo1.is_active = true AND uo2.is_active = true`). Ao desativar alguém, o vínculo continua
visível, mas o nome/e-mail dessa pessoa deixa de ser legível — e a tela descarta qualquer
linha sem dados de usuário (`validMembers = memberships.filter(m => m.users)`). Resultado:
a pessoa "desaparece" em vez de migrar para Inativos.

## Correção

Ajustar a política de SELECT de `users` para que quem administra a organização (mesma
checagem canônica já usada em `current_user_managed_org_ids()`) veja também os membros
inativos da própria organização. Nada muda para usuários comuns e continua sem qualquer
acesso entre organizações.

Nenhuma mudança de comportamento no acesso da pessoa desativada — o logout imediato fica
como está hoje, conforme pedido.

## Detalhes técnicos

- Migração: substituir a policy `Users can view members of same organization` em
  `public.users` por versão que adiciona
  `OR id IN (select uo.user_id from public.user_organizations uo
  where uo.organization_id = ANY(current_user_managed_org_ids()))`.
- Sem novos grants, sem alteração em `user_organizations`, sem mudança de frontend
  (a aba "Inativos" já filtra corretamente e passará a listar as pessoas).
- Validação após aplicar: abrir Configurações → Usuários → aba Inativos na Central
  Trabalhista e confirmar as 7 pessoas.
