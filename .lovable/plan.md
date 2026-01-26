
# Plano: Corrigir Atualização de Status de Usuário

## Problema Identificado

A tabela `user_organizations` só tem política RLS para `SELECT`. Não há políticas para `UPDATE`, `INSERT` ou `DELETE`, então:
1. O admin tenta desativar um usuário
2. Supabase recusa silenciosamente (0 rows affected, sem erro)
3. O código exibe toast de sucesso mesmo sem mudança
4. A UI recarrega os mesmos dados do banco

## Solução

### Parte 1: Criar Políticas RLS para UPDATE

Precisamos de uma política que permita admins da organização atualizarem membros.

### Parte 2: Verificar se o UPDATE realmente funcionou

Modificar o código para verificar se alguma linha foi afetada.

---

## Arquivos a Modificar

| Tipo | Local | Descrição |
|------|-------|-----------|
| SQL | Nova migration | Criar política RLS para UPDATE |
| React | `UsersSettings.tsx` | Verificar resultado do update |

---

## Implementação

### 1. Nova Migration SQL

Criar arquivo: `supabase/migrations/XXXXXXX_add_user_orgs_update_policy.sql`

```sql
-- Permitir que admins da organização atualizem membros
CREATE POLICY "Admins can update org memberships"
ON user_organizations
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = auth.uid() 
    AND uo.is_active = true
    AND pp.can_manage_users = true
  )
)
WITH CHECK (
  organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = auth.uid() 
    AND uo.is_active = true
    AND pp.can_manage_users = true
  )
);
```

Esta política:
- Verifica se o usuário logado pertence à mesma organização
- Verifica se o perfil de permissão tem `can_manage_users = true`
- Usa `USING` para filtrar linhas que podem ser atualizadas
- Usa `WITH CHECK` para validar os novos valores

### 2. Modificar UsersSettings.tsx

Atualizar a função `toggleStatus` para verificar se o update funcionou:

**Localização**: Linhas 284-289

**Mudança**:
```typescript
// ANTES
const { error } = await supabase
  .from('user_organizations')
  .update({ is_active: !currentStatus })
  .eq('id', membershipId);

if (error) throw error;

// DEPOIS
const { error, count } = await supabase
  .from('user_organizations')
  .update({ is_active: !currentStatus })
  .eq('id', membershipId)
  .select();  // Adiciona select() para retornar dados

if (error) throw error;

// Verificar se alguma linha foi atualizada
if (!count && count !== undefined) {
  throw new Error('Sem permissão para atualizar este usuário');
}
```

**Alternativa mais robusta** (usando `.select()` para verificar):
```typescript
const { data, error } = await supabase
  .from('user_organizations')
  .update({ is_active: !currentStatus })
  .eq('id', membershipId)
  .select('id, is_active')
  .single();

if (error) throw error;

if (!data) {
  throw new Error('Sem permissão para atualizar este usuário');
}

// Verificar se realmente mudou
if (data.is_active === currentStatus) {
  throw new Error('Falha ao atualizar status do usuário');
}
```

---

## Fluxo Corrigido

```text
Admin clica "Desativar"
       ↓
UPDATE com RLS (política verifica can_manage_users)
       ↓
┌─────────────────────────────────────┐
│ Política permite?                   │
├────────────┬────────────────────────┤
│ SIM        │ NÃO                    │
│ ↓          │ ↓                      │
│ Atualiza   │ Retorna 0 rows         │
│ is_active  │ ou null                │
│ ↓          │ ↓                      │
│ Toast ✅   │ Toast erro ❌          │
│ Recarrega  │ UI não muda            │
└────────────┴────────────────────────┘
```

---

## Seção Técnica

### Por que não havia erro?

O Supabase com RLS não retorna erro quando uma política bloqueia - simplesmente não afeta nenhuma linha. Isso é "segurança por design" para não vazar informações sobre existência de dados.

### Estrutura atual de permissões

```sql
-- permission_profiles tem a coluna can_manage_users
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'permission_profiles' 
AND column_name = 'can_manage_users';
```

A política usa essa permissão para controlar quem pode ativar/desativar usuários.

### Checklist de Segurança

1. **Não permitir auto-desativação**: Adicionar validação no frontend para impedir que o usuário desative a si mesmo
2. **Validar organização**: A política garante que só admins da mesma org podem modificar
3. **Auditar mudanças**: Considerar adicionar log de auditoria para mudanças de status

---

## Ordem de Implementação

1. **Criar a migration** com a política RLS
2. **Rodar a migration** no Supabase
3. **Modificar** `UsersSettings.tsx` para verificar resultado
4. **Testar** desativando um usuário
5. **Verificar** que a UI atualiza corretamente
