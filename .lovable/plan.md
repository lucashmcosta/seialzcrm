

## Criar usuário admin na Plamev

Usar a Edge Function `create-user` já existente para criar o usuário com os seguintes dados:

- **Email:** lcosta@plamev.com.br
- **Nome:** L Costa
- **Senha:** 123456
- **Organização:** Plamev (`0cc6e2a4-adff-4b0d-a734-3c3422d9fb8e`)
- **Perfil:** Admin (`26e9aa0d-53b0-469e-8459-09be80ec5052`)

### Problema

A edge function `create-user` exige um chamador autenticado com permissão `can_manage_users`. Para executar sem depender de sessão, vou criar uma **edge function temporária** (`admin-create-user-temp`) que usa `SERVICE_ROLE_KEY` diretamente, cria o usuário no auth, limpa a org auto-criada pelo trigger, e vincula à Plamev com perfil Admin. Após execução bem-sucedida, a function será removida.

### Dados necessários antes de prosseguir

Preciso confirmar o **nome completo** do usuário. Vou usar "L Costa" como placeholder — me confirme o nome correto.

### Passos

1. Criar `supabase/functions/admin-create-user-temp/index.ts` com SERVICE_ROLE_KEY
2. Registrar no `config.toml` com `verify_jwt = false`
3. Invocar a function via curl para criar o usuário
4. Remover a function e entrada no config.toml

