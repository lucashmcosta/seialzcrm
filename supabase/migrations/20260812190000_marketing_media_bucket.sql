-- Bucket público p/ imagens de publicação do Marketing (Instagram exige URL pública).
insert into storage.buckets (id, name, public)
values ('marketing-media', 'marketing-media', true)
on conflict (id) do nothing;

drop policy if exists "marketing_media_insert" on storage.objects;
create policy "marketing_media_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'marketing-media');

drop policy if exists "marketing_media_select" on storage.objects;
create policy "marketing_media_select" on storage.objects
  for select to authenticated using (bucket_id = 'marketing-media');

drop policy if exists "marketing_media_delete" on storage.objects;
create policy "marketing_media_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'marketing-media');
