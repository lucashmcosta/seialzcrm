# Criar acesso de administrador na Squadra

Criar o acesso de **Junior Domingos** (njunior@squadra.biz) como administrador na organização **Squadra** que hoje tem alanvital@squadra.biz e lcosta@tributario.com.

## Situação verificada

- A organização escolhida existe e tem 2 pessoas ativas, com limite de 3 lugares no plano — cabe mais uma.
- O e-mail njunior@squadra.biz ainda não existe no sistema.
- Essa organização já tem o perfil de permissão "Admin", que será atribuído ao novo acesso.

## Como será feito

O acesso será criado pelo mesmo caminho que a tela de Usuários usa, sem nenhuma alteração de código no app:

1. Autenticar como um administrador atual da Squadra (alanvital@squadra.biz), apenas para autorizar a criação.
2. Criar o acesso com: e-mail njunior@squadra.biz, nome Junior Domingos, senha 123456, perfil Admin, na organização Squadra.
3. Conferir na base que o acesso ficou criado, ativo, vinculado à Squadra e com o perfil Admin.

Nenhum arquivo do projeto é alterado; nada muda para os usuários existentes.

## Observação sobre a senha

A senha 123456 é aceita, mas é fraca. Recomendo trocá-la no primeiro acesso, em Perfil.

## Detalhes técnicos

- Sessão do administrador atual obtida com `lovable auth-session --user <uuid de alanvital@squadra.biz>`.
- Chamada da edge function `create-user` (já existente, valida JWT, `can_manage_users`, limite de lugares e cria em `auth.users` + `users` + `user_organizations`) com `permission_profile_id` do perfil Admin e `organization_id` 4e57b6fb-54b8-4dce-b551-5d433f01cc21.
- Validação read-only depois: `users` por e-mail e `user_organizations` (is_active, permission_profile_id).
