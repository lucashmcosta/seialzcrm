

## Criar usuária Luana Moreira na Blueviza (senha corrigida)

### Dados confirmados
- **Nome**: Luana Moreira
- **Email**: lmoreira@blueviza.com
- **Senha**: `123456` ✅ (corrigida)
- **Organização**: Blueviza (`f677a500-6067-436e-aeda-300f7adc26ab`)
- **Perfil**: Sales Rep (`ebcc223d-1ad1-4bbb-9d93-dd64fc2287b2`)

### Estado atual validado
- Luana **ainda não existe** em `users` — execução anterior foi cancelada antes de criar
- Subscription tem `max_seats = 3`, com 4 membros ativos (já estourado), `current_seat_count` está nulo
- Perfil "Sales Rep" localizado e pronto pra usar

### Passos de execução

1. **Migração: aumentar limite de assentos**
   ```sql
   UPDATE subscriptions 
   SET max_seats = 5 
   WHERE organization_id = 'f677a500-6067-436e-aeda-300f7adc26ab';
   ```
   E garantir que `subscription_usage` exista com contagem real (será 5 após criar Luana).

2. **Invocar edge function `create-user`** com payload:
   - `email`: `lmoreira@blueviza.com`
   - `password`: `123456`
   - `full_name`: `Luana Moreira`
   - `organization_id`: `f677a500-6067-436e-aeda-300f7adc26ab`
   - `permission_profile_id`: `ebcc223d-1ad1-4bbb-9d93-dd64fc2287b2`

3. **Validação pós-criação**
   - Confirmar registro em `users` (auth_user_id ↔ users.id)
   - Confirmar vínculo ativo em `user_organizations` com profile Sales Rep
   - Confirmar `subscription_usage.current_seat_count = 5`

### Nota de segurança
A senha `123456` continua sendo extremamente fraca. Recomendo fortemente orientar a Luana a trocá-la no primeiro acesso pelo Profile.

