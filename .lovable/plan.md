
# Plano: Corrigir Recursão Infinita na Política RLS

## Problema Identificado

A política "Admins can view all org memberships" que criamos está causando recursão infinita:

```
Erro: infinite recursion detected in policy for relation "user_organizations"
```

Isso acontece porque:
1. O PostgreSQL tenta verificar a política de SELECT na tabela `user_organizations`
2. A política faz uma sub-query na mesma tabela `user_organizations`
3. Essa sub-query também precisa passar pelas políticas de SELECT
4. Loop infinito

## Solução

Criar uma função `SECURITY DEFINER` com `SET row_security TO 'off'` que verifica se o usuário atual tem permissão `can_manage_users`. Esta abordagem é a mesma usada pela função `current_user_org_ids()` que já existe.

---

## Arquivos a Modificar

| Tipo | Local | Descrição |
|------|-------|-----------|
| SQL | Nova migration | Criar função helper e recriar política |

---

## Implementação

### Nova Migration SQL

```sql
-- 1. Criar função que verifica se usuário é admin (com RLS desabilitado)
CREATE OR REPLACE FUNCTION current_user_managed_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
SET row_security = 'off'
AS $$
  SELECT COALESCE(
    array_agg(uo.organization_id),
    '{}'::uuid[]
  )
  FROM user_organizations uo
  JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
  WHERE uo.user_id = current_user_id()
  AND uo.is_active = true
  AND (pp.permissions->>'can_manage_users')::boolean = true
$$;

-- 2. Remover política que causa recursão
DROP POLICY IF EXISTS "Admins can view all org memberships" 
ON user_organizations;

-- 3. Recriar política usando a nova função
CREATE POLICY "Admins can view all org memberships"
ON user_organizations
FOR SELECT
TO authenticated
USING (
  organization_id = ANY (current_user_managed_org_ids())
);
```

---

## Como Funciona

```text
┌─────────────────────────────────────────────────────────────┐
│ ANTES (recursão infinita)                                   │
├─────────────────────────────────────────────────────────────┤
│ Política SELECT → Sub-query em user_organizations           │
│       ↓                                                     │
│ Sub-query precisa verificar política SELECT                 │
│       ↓                                                     │
│ Política SELECT → Sub-query em user_organizations           │
│       ↓                                                     │
│ ∞ LOOP                                                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ DEPOIS (correto)                                            │
├─────────────────────────────────────────────────────────────┤
│ Política SELECT chama current_user_managed_org_ids()        │
│       ↓                                                     │
│ Função tem SECURITY DEFINER + row_security = 'off'          │
│       ↓                                                     │
│ Função consulta user_organizations SEM passar por RLS       │
│       ↓                                                     │
│ Retorna array de org_ids onde usuário é admin               │
│       ↓                                                     │
│ Política aplica o filtro sem recursão                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Seção Técnica

### Por que SECURITY DEFINER + row_security = 'off'?

- **SECURITY DEFINER**: Executa com permissões do dono da função (superuser), não do usuário chamador
- **row_security = 'off'**: Desabilita RLS dentro da função, evitando recursão

Esta é exatamente a mesma abordagem usada em `current_user_org_ids()`.

### Resultado Esperado

Após a migração:
1. Admins poderão ver **todos** os membros (ativos e inativos)
2. Usuários normais verão apenas membros das organizações onde estão ativos
3. Sem recursão infinita
4. Lista de usuários desativados aparecerá com badge "Desativado"

---

## Ordem de Implementação

1. Criar migration com função e política corrigida
2. Executar migration no Supabase
3. Recarregar página de Usuários
4. Verificar que lista mostra todos os usuários (incluindo inativos)
