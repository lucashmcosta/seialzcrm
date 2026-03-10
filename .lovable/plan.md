

## Tornar Allan Tavares admin na Viagi

### Situação atual
- **Usuário**: Allan Tavares (`atavares@viagi.com.br`)
- **Org**: Viagi (`b246ef6f-6242-4011-a112-6d8783d2896a`)
- **Perfil atual**: Sales Rep (só pode ver/editar contatos e oportunidades)

### O que precisa ser feito
Atualizar o `permission_profile_id` no registro `user_organizations` de Allan para o perfil **Admin** (`2f5bd892-8392-43a9-8a03-325f25541747`), que já existe na Viagi e inclui todas as permissões (settings, integrações, billing, users, etc.).

### Operação
Uma única query UPDATE na tabela `user_organizations`:

```sql
UPDATE user_organizations
SET permission_profile_id = '2f5bd892-8392-43a9-8a03-325f25541747'
WHERE user_id = '200dbbd9-5143-402f-86c8-8667dd6f691e'
  AND organization_id = 'b246ef6f-6242-4011-a112-6d8783d2896a';
```

Nenhuma mudança de código necessária -- apenas uma operação de dados.

