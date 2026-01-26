

# Plano: Corrigir Política RLS para Atualização de Usuários

## Problema Identificado

A política RLS criada anteriormente está usando `auth.uid()` diretamente, mas na tabela `user_organizations` o campo `user_id` armazena o ID da tabela `users`, não o ID do auth.

**Dados atuais:**
- `auth.uid()` do Lucas: `d2dc1e4b-55e9-4c29-b110-cbf9ddf0d3e8`
- `user_id` do Lucas na `user_organizations`: `58ce5ec9-2780-46db-bff3-a72d95024727`

A política atual verifica:
```sql
WHERE uo.user_id = auth.uid()  -- Nunca vai dar match!
```

Precisa verificar:
```sql
WHERE uo.user_id = current_user_id()  -- Usa a função que faz a conversão
```

## Solução

### Alterar a Política RLS Existente

Precisamos recriar a política usando `current_user_id()` em vez de `auth.uid()`.

---

## Arquivos a Modificar

| Tipo | Local | Descrição |
|------|-------|-----------|
| SQL | Nova migration | Recriar política RLS correta |

---

## Implementação

### Nova Migration SQL

```sql
-- Remover política incorreta
DROP POLICY IF EXISTS "Admins can update org memberships" ON user_organizations;

-- Criar política corrigida usando current_user_id()
CREATE POLICY "Admins can update org memberships"
ON user_organizations
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = current_user_id() 
    AND uo.is_active = true
    AND (pp.permissions->>'can_manage_users')::boolean = true
  )
)
WITH CHECK (
  organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = current_user_id() 
    AND uo.is_active = true
    AND (pp.permissions->>'can_manage_users')::boolean = true
  )
);
```

---

## Por que isso vai funcionar agora?

```text
┌─────────────────────────────────────────────────────────┐
│ ANTES (incorreto)                                       │
├─────────────────────────────────────────────────────────┤
│ uo.user_id = auth.uid()                                 │
│                                                         │
│ 58ce5ec9-... = d2dc1e4b-...  → FALSE (IDs diferentes)   │
│ ↓                                                       │
│ 0 rows afetadas                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ DEPOIS (correto)                                        │
├─────────────────────────────────────────────────────────┤
│ uo.user_id = current_user_id()                          │
│                                                         │
│ current_user_id() retorna 58ce5ec9-... (user.id)        │
│ 58ce5ec9-... = 58ce5ec9-...  → TRUE                     │
│ ↓                                                       │
│ UPDATE permitido!                                       │
└─────────────────────────────────────────────────────────┘
```

---

## Seção Técnica

### Função current_user_id()

Já existe uma função `SECURITY DEFINER` que faz a conversão:

```sql
CREATE FUNCTION current_user_id() RETURNS uuid
SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
```

Esta função:
1. Pega o `auth.uid()` (ID do auth)
2. Busca na tabela `users` o registro que tem esse `auth_user_id`
3. Retorna o `id` da tabela `users`

### Por que isso é importante?

O sistema usa dois IDs diferentes:
- `auth.uid()`: ID gerado pelo Supabase Auth
- `users.id`: ID interno do sistema

A tabela `user_organizations` usa `users.id`, então precisamos da função de conversão.

---

## Ordem de Implementação

1. **Criar nova migration** para recriar a política
2. **Rodar a migration** no Supabase
3. **Testar** desativando um usuário
4. **Verificar** que a UI atualiza corretamente

