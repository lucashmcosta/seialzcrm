## Problema

Os filtros **"Não atribuídas"**, **"Todas abertas"** e **"Resolvidas"** sumiram da página de Mensagens da Ketlyn (kvieira@viagi.com.br).

**Causa raiz:** em `src/pages/messages/MessagesList.tsx` (linha 1027), os 3 filtros são marcados como `requiresViewAll: true` e só aparecem quando `permissions.viewAllThreads === true`. A Ketlyn está no perfil "Sales Rep" da VIAGI, e esse perfil tem `view_all_threads` desativado — por isso o filtro "Minhas" é o único visível e o `useEffect` força `setFilter('mine')`.

A organização VIAGI já tem um perfil "Admin" (`id: 2f5bd892-8392-43a9-8a03-325f25541747`) com `view_all_threads = true` e `manage_assignments = true`.

## Plano

**1. Atualizar a vinculação da Ketlyn no banco**

Trocar o `permission_profile_id` da Ketlyn em `user_organizations` do perfil "Sales Rep" para "Admin" (escopo: apenas a organização VIAGI, registro ativo).

```sql
UPDATE public.user_organizations
SET permission_profile_id = '2f5bd892-8392-43a9-8a03-325f25541747' -- Admin VIAGI
WHERE user_id = (SELECT id FROM public.users WHERE email = 'kvieira@viagi.com.br')
  AND organization_id = (
    SELECT organization_id FROM public.permission_profiles
    WHERE id = '2f5bd892-8392-43a9-8a03-325f25541747'
  )
  AND is_active = true;
```

**2. Validar**

Rodar um SELECT para confirmar que `view_all_threads` agora retorna `true` para a Ketlyn.

**3. Sem mudanças de código**

A lógica do `MessagesList.tsx` está correta — não precisa de alteração. O cache do React Query (`staleTime: 10min`) das permissões será invalidado quando ela recarregar a página.

## Resultado esperado

Após a atualização, ao recarregar `/messages`, a Ketlyn verá os 4 filtros: **Minhas**, **Não atribuídas**, **Todas abertas**, **Resolvidas** — e como Admin também ganha acesso a gerenciamento de usuários, atribuições e outras telas administrativas da organização.

> ⚠️ **Atenção:** o perfil "Admin" concede também `can_manage_users`, `manage_assignments` e demais permissões administrativas da organização. Se quiser apenas a visibilidade de threads sem dar poderes administrativos completos, me avise que crio um perfil intermediário (ex: "Sales Manager") com `view_all_threads + manage_assignments` apenas.
