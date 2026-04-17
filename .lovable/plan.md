

## Plano: criar Victoria Caroline na Central Trabalhista

### Diagnóstico revisado
A edge function `create-user` **não vai bloquear** a criação porque `subscription_usage.current_seat_count` está NULL → tratado como 0 → `0 >= 3` é falso → passa.

Foi exatamente assim que os 7 usuários atuais foram criados. Não preciso mexer em `max_seats` nem na edge function.

### Execução (1 passo apenas)

Invocar a edge function `create-user` via service role com payload:
- `email`: vamorim@centraltrabalhista.com.br
- `full_name`: Victoria Caroline Vieira Amorim de Souza
- `password`: 123456
- `organization_id`: 40ae935c-a7f7-4ad7-8ea4-91be6404a95f
- `permission_profile_id`: a definir entre Admin ou Sales Rep da Central Trabalhista

A função vai:
1. Criar em `auth.users` com email confirmado
2. Criar em `public.users`
3. Vincular em `user_organizations` ativa
4. Limpar a auto-org criada pelo trigger `handle_new_user`
5. Incrementar `subscription_usage.current_seat_count`

### O que eu preciso de você antes de executar

**Qual perfil de permissão atribuir à Victoria?**
- **Admin**: gerencia usuários, integrações, billing, settings, tudo
- **Sales Rep**: apenas contatos e oportunidades

### O que NÃO vou fazer
- Não vou alterar `max_seats` (desnecessário)
- Não vou remover a validação de seat limit da edge function (você não pediu isso explicitamente, e remover tem implicações pra todas as outras orgs do sistema — se quiser mesmo remover, é uma decisão separada que posso tratar depois)
- Não vou mexer no `subscription_usage` da Central Trabalhista pra "consertar" o contador (mesma lógica acima)

### Erros de build pendentes (não relacionados)
Os erros TS em `ContactTasks.tsx` e `Dashboard.tsx` que apareceram no build **não foram causados por essa task** e não bloqueiam a criação da Victoria (edge function roda no servidor). Posso tratar eles depois separadamente se quiser.

