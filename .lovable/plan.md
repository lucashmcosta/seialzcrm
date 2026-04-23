

## Permitir editar o perfil de permissão de usuários ativos

### Problema
Na tela **Configurações → Usuários & Permissões**, a coluna "Perfil" mostra o cargo do usuário apenas como uma badge estática (`Admin`, `Sales Rep`). Não existe nenhum controle para alterá-lo. A única ação disponível por linha é **Desativar/Ativar**.

Resultado: pra trocar o Allan de "Sales Rep" para "Admin" hoje seria preciso mexer direto no banco — o que não é aceitável.

### Solução
Transformar a célula "Perfil" da tabela de usuários ativos em um **`Select` editável**, populado com os perfis existentes da organização (já carregados via `permissionProfiles`). Ao trocar a opção, faz `UPDATE user_organizations SET permission_profile_id = ... WHERE id = membership.id`.

### Mudanças

**Arquivo único:** `src/components/settings/UsersSettings.tsx`

1. **Nova função `updatePermissionProfile(membershipId, newProfileId)`**
   - `supabase.from('user_organizations').update({ permission_profile_id }).eq('id', membershipId).select().single()`
   - Toast de sucesso ("Perfil atualizado") ou erro ("Sem permissão para atualizar este usuário" se RLS bloquear)
   - `fetchMemberships()` ao final para refrescar a UI
   - Estado local `updatingProfileId` para mostrar spinner inline enquanto salva

2. **Substituir a `<Badge>` da coluna "Perfil"** (na tabela de usuários ativos) por um `<Select>`:
   - `value={membership.permission_profile_id ?? ''}`
   - `onValueChange={(v) => updatePermissionProfile(membership.id, v)}`
   - Opções vindas de `permissionProfiles` (já carregadas)
   - Trigger compacto (`h-8 w-[140px]`) pra não inflar a linha
   - Desabilitado enquanto `updatingProfileId === membership.id`

3. **Proteção do próprio usuário (segurança UX):**
   - Se `membership.user_id === userProfile.id`, manter como `<Badge>` somente leitura — evita o admin se rebaixar acidentalmente e ficar trancado fora.

4. **Pendentes (convites)**: continuam com `<Badge>` — convite é imutável; pra mudar, basta cancelar e reenviar. Sem mudança aqui.

### Pré-requisito de permissão
A RLS de `user_organizations` já permite `UPDATE` para admins da org (a função `toggleStatus` existente faz exatamente isso e funciona). Reaproveitamos a mesma rota.

### Fora do escopo
- Edição em massa de perfis (não pediu).
- Editar perfil de convites pendentes (irrelevante — basta recriar).
- Mudanças no `PermissionProfilesSettings` (lá já dá pra editar os perfis em si).

