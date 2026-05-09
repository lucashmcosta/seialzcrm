create or replace function public.admin_list_pipeline_stages(p_org_id uuid)
returns table (id uuid, name text, order_index int, type text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user() then
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