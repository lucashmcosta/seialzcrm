-- Materiais Plamev: remover (padrão) x excluir de vez.
-- Remover = soft delete: some do widget e da lista do admin, o arquivo fica (conversas que já receberam continuam
-- abrindo) e dá para restaurar. Excluir de vez = apaga linha e arquivo, só para material que nunca foi enviado
-- (ex.: subiu errado). "Enviado" = alguma mensagem com a URL do material em media_urls.

alter table public.plamev_materials
  add column if not exists removido_em timestamptz,
  add column if not exists removido_por_auth_user_id uuid;

drop index if exists public.idx_plamev_materials_ativos;
create index if not exists idx_plamev_materials_ativos on public.plamev_materials (ordem, created_at)
  where ativo and removido_em is null;

-- Já foi enviado em alguma conversa? Só a equipe Seialz pergunta (lê messages de todas as orgs, sem devolver nada delas).
create or replace function public.plamev_material_enviado(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_criado timestamptz;
begin
  if not public.is_admin_user() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select created_at into v_criado from public.plamev_materials where id = p_id;
  if not found then return false; end if;
  return exists (
    select 1 from public.messages m
    where m.created_at >= v_criado
      and m.media_urls is not null
      and m.media_urls::text like '%/plamev-materiais/' || p_id::text || '/%'
  );
end;
$$;

-- Exclui de vez a linha (o arquivo o admin apaga em seguida pelo storage) e devolve o caminho do arquivo.
-- Recusa material já enviado: aí só dá para remover.
create or replace function public.plamev_material_excluir(p_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_path text;
begin
  if not public.is_admin_user() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if public.plamev_material_enviado(p_id) then
    raise exception 'material_ja_enviado' using errcode = '23514';
  end if;
  delete from public.plamev_materials where id = p_id returning storage_path into v_path;
  return v_path;
end;
$$;

revoke all on function public.plamev_material_enviado(uuid) from public, anon;
revoke all on function public.plamev_material_excluir(uuid) from public, anon;
grant execute on function public.plamev_material_enviado(uuid) to authenticated;
grant execute on function public.plamev_material_excluir(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
