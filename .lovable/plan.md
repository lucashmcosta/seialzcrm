
# Plano: Mostrar Usuários Desativados na Lista

## Problema Identificado

A desativação funcionou corretamente! O banco de dados mostra:
- **Vitor Carvalho** com `is_active: false`

Porém, a **política RLS de SELECT** na tabela `user_organizations` não está permitindo que admins vejam usuários inativos.

### Causa Raiz

A função `current_user_org_ids()` usada na política de SELECT filtra apenas organizações onde o usuário está ativo:

```sql
WHERE uo.user_id = current_user_id()
AND uo.is_active = true  -- Este filtro é o problema
```

A política de SELECT atual:
```sql
USING (organization_id = ANY (current_user_org_ids()))
```

Isso impede que administradores vejam usuários desativados da mesma organização.

## Solução

Criar uma **nova política de SELECT** específica que permite admins verem todos os membros (ativos e inativos) da organização.

---

## Arquivos a Modificar

| Tipo | Local | Descrição |
|------|-------|-----------|
| SQL | Nova migration | Adicionar política SELECT para admins verem todos os membros |

---

## Implementação

### Nova Migration SQL

```sql
-- Política para admins verem todos os membros (ativos e inativos)
CREATE POLICY "Admins can view all org memberships"
ON user_organizations
FOR SELECT
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
);
```

Esta política:
1. Verifica se o usuário logado tem `can_manage_users = true`
2. Permite ver TODOS os membros daquela organização
3. Funciona em conjunto com a política existente (OR entre políticas)

---

## Como as Políticas Funcionam Juntas

```text
┌─────────────────────────────────────────────────────────────┐
│ POLÍTICA 1: "Users can view org memberships"                │
│ → Usuário comum vê membros das suas organizações ativas     │
├─────────────────────────────────────────────────────────────┤
│ POLÍTICA 2: "Admins can view all org memberships" (NOVA)    │
│ → Admin vê TODOS os membros (ativos + inativos)             │
└─────────────────────────────────────────────────────────────┘

PostgreSQL faz OR entre políticas do mesmo tipo (SELECT)
Se QUALQUER uma permitir, o acesso é concedido.
```

---

## Fluxo Esperado Após a Correção

```text
Admin clica "Desativar" no Vitor
       ↓
UPDATE is_active = false ✓ (já funciona)
       ↓
Recarrega lista de usuários
       ↓
Política nova permite ver Vitor (is_active = false)
       ↓
UI mostra Vitor com badge "Desativado"
       ↓
Botão muda para "Ativar"
```

---

## Seção Técnica

### Por que não modificar current_user_org_ids()?

A função `current_user_org_ids()` é usada em várias partes do sistema para garantir que usuários desativados não tenham acesso. Modificá-la quebraria essa segurança.

A solução correta é criar uma política adicional específica para admins.

### Ordem de Execução

1. Criar migration com a nova política
2. Aplicar migration no Supabase
3. Testar visualização da lista de usuários
4. Verificar que Vitor Carvalho aparece como "Desativado"
