-- Bucket público p/ anexos enviados pela caixa Social (IG Direct + Messenger).
-- A Meta busca o arquivo por URL pública ao enviar attachment por URL, então precisa
-- ser público para leitura. Escritas/remoções só por usuário autenticado.
insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do nothing;

drop policy if exists "social_media_insert" on storage.objects;
create policy "social_media_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'social-media');

drop policy if exists "social_media_select" on storage.objects;
create policy "social_media_select" on storage.objects
  for select to authenticated using (bucket_id = 'social-media');

drop policy if exists "social_media_delete" on storage.objects;
create policy "social_media_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'social-media');
