## Problema

Na aba **Outbound** de `/admin/integrations/:id` (Kommo), a tabela "Mapeamento de Estágios" aparece vazia para qualquer org que o super-admin não seja membro. Causa: o componente faz `supabase.from('pipeline_stages').select(...).eq('organization_id', selectedOrgId)` direto do client, e a RLS de `pipeline_stages` exige que o usuário pertença à org (`user_has_org_access`). O super-admin Seialz não pertence à Blueviza, então retorna 0 linhas mesmo havendo 5 estágios.

A consulta do Kommo (pipelines/statuses) já funciona porque é feita via edge function autenticada pelo `access_token` da org, sem passar por RLS.

## Solução

Criar um RPC `security definer` que retorne os estágios de qualquer org, restrito a super-admins, e trocar a query do client por esse RPC.

### 1. Migration: novo RPC

```sql
create or replace function public.admin_list_pipeline_stages(p_org_id uuid)
returns table (
  id uuid,
  name text,
  order_index int,
  type text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(public.current_user_id()) then
    raise exception 'forbidden';
  end if;

  return query
    select ps.id, ps.name, ps.order_index, ps.type::text
    from public.pipeline_stages ps
    where ps.organization_id = p_org_id
    order by ps.order_index;
end;
$$;

revoke all on function public.admin_list_pipeline_stages(uuid) from public;
grant execute on function public.admin_list_pipeline_stages(uuid) to authenticated;
```

(Se o nome da função de checagem de super-admin for diferente — `is_admin`, `has_role(..., 'super_admin')` etc. — uso a que já existir no projeto. Verifico antes de escrever.)

### 2. Frontend: `src/components/admin/KommoOutboundTab.tsx`

Trocar o `useQuery` `internal-stages` para chamar o RPC:

```ts
const { data: internalStages } = useQuery({
  queryKey: ['admin-internal-stages', selectedOrgId],
  queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_list_pipeline_stages', {
      p_org_id: selectedOrgId,
    });
    if (error) throw error;
    return data || [];
  },
  enabled: !!selectedOrgId,
});
```

### 3. Validação

- Verifico no banco qual função existente identifica super-admin (provavelmente `is_super_admin` ou `has_role`).
- Após a migration, abrir `/admin/integrations/:kommo/Outbound` com a Blueviza selecionada e confirmar que os 5 estágios aparecem com seus selects de mapeamento.
- Sanity check: usuário comum não consegue chamar o RPC (retorna `forbidden`).

## Fora do escopo

- Mapeamento de owners e responsáveis (já é Step 3 separado).
- Mudar a forma como o Kommo é consultado (continua via edge function).
