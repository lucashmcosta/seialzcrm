

## Criar usuária Luana Moreira na Blueviza

### Dados confirmados
- **Nome**: Luana Moreira
- **Email**: lmoreira@blueviza.com
- **Senha**: 1235456
- **Organização**: Blueviza (`f677a500-6067-436e-aeda-300f7adc26ab`)
- **Perfil**: Sales Rep (vê apenas os contatos/oportunidades atribuídos a ela)

### Passos de execução

1. **Aumentar limite de assentos da Blueviza**
   - Hoje: `max_seats = 3` com 4 membros ativos (já estourado)
   - Migração: `UPDATE subscriptions SET max_seats = 5 WHERE organization_id = 'f677a500-6067-436e-aeda-300f7adc26ab'`
   - Atualizar `subscription_usage.current_seat_count` para refletir o estado real (5 após criar Luana)

2. **Localizar o `permission_profile_id` do perfil "Sales Rep" da Blueviza**
   - Query em `permission_profiles` filtrando pela org_id da Blueviza e nome `Sales Rep`

3. **Criar a conta da Luana via edge function `create-user`**
   - Payload: email, password, full_name, organization_id, permission_profile_id
   - A função já valida permissões, cria o usuário no `auth.users`, no `users`, e cria o vínculo em `user_organizations`
   - Como sou platform admin, posso invocar essa função diretamente

4. **Validação pós-criação**
   - Confirmar registro em `users` (auth_user_id ↔ users.id)
   - Confirmar vínculo ativo em `user_organizations` com o profile correto
   - Confirmar `subscription_usage.current_seat_count = 5`

### Nota de segurança
A senha `1235456` é fraca (6 dígitos sequenciais). Recomendo orientar a Luana a trocá-la no primeiro acesso pelo Profile.

