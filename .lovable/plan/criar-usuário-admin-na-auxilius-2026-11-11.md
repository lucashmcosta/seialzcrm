# Criar usuário Admin na Auxilius

## Situação verificada
- Organização Auxilius existe (`4bba3f19…`).
- O e-mail njunior@auxilius.com.br ainda não tem conta no Seialz.
- Perfil de sistema da Auxilius: "Admin" (`52ed9967…`, is_system = true).
- Admins ativos hoje: lcosta@ e gsenna@auxilius.com.br.

## O que será feito
1. Criar a conta pelo mesmo caminho da tela de Usuários (função `create-user`), executada com a sessão de um Admin atual da Auxilius (lcosta@). Isso pede sua aprovação na hora de entrar como esse usuário.
2. Dados: e-mail njunior@auxilius.com.br, nome "Junior Domingos", perfil Admin, organização Auxilius.
3. Senha: a informada por você (6 dígitos). Se o servidor recusar por ser fraca, paro e peço outra; nada é criado nesse caso. Recomendo trocá-la no primeiro acesso.
4. Conferir no banco: conta criada, vínculo ativo na Auxilius com perfil Admin, e que nenhuma organização extra foi criada para ele. Se surgir uma organização vazia, ela é apontada para você antes de qualquer remoção.

## Não será alterado
Código, outros usuários, perfis, permissões ou outras organizações.
