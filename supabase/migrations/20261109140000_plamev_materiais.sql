-- Materiais de apoio da Plamev (PDF de coberturas, PNG de comparativos) para o widget plamev_quote.
-- São da Plamev, não de uma org: uma biblioteca só, mantida pela equipe Seialz em /admin/plamev-materiais, que vale
-- para toda org com o widget ligado (agentes autorizados da Plamev). O vendedor envia na conversa pelo widget.
--
-- Arquivos no bucket público plamev-materiais, em {id}/{Nome-legivel}.{ext}: o WhatsApp (Evolution/Meta/Twilio) baixa
-- pela URL e usa o fim dela como nome do arquivo. Remover só desativa: mensagens já enviadas continuam abrindo.

create table if not exists public.plamev_materials (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) between 1 and 120),
  descricao text not null default '' check (length(descricao) <= 500),
  tipo text not null check (tipo in ('image', 'document')),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  storage_path text not null unique,
  tamanho_bytes bigint not null check (tamanho_bytes > 0),
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plamev_materials_ativos on public.plamev_materials (ordem, created_at) where ativo;

alter table public.plamev_materials enable row level security;
revoke all on public.plamev_materials from public, anon;
grant select, insert, update, delete on public.plamev_materials to authenticated;
grant all on public.plamev_materials to service_role;

-- Só a equipe Seialz (admin com MFA) mexe. O widget lê pela edge function plamev-quote (service_role).
drop policy if exists plamev_materials_admin on public.plamev_materials;
create policy plamev_materials_admin on public.plamev_materials
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());

drop trigger if exists trg_plamev_materials_updated on public.plamev_materials;
create trigger trg_plamev_materials_updated
before update on public.plamev_materials
for each row execute function public.update_updated_at_column();

-- Público para leitura pela URL (o provider de WhatsApp precisa baixar); 16 MB (imagem no WhatsApp vai até 5 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plamev-materiais', 'plamev-materiais', true, 16777216,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists plamev_materiais_admin_insert on storage.objects;
create policy plamev_materiais_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'plamev-materiais' and public.is_admin_user());

drop policy if exists plamev_materiais_admin_select on storage.objects;
create policy plamev_materiais_admin_select on storage.objects
  for select to authenticated using (bucket_id = 'plamev-materiais' and public.is_admin_user());

drop policy if exists plamev_materiais_admin_delete on storage.objects;
create policy plamev_materiais_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'plamev-materiais' and public.is_admin_user());

NOTIFY pgrst, 'reload schema';
