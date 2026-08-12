-- DOWN do bucket social-media. Remove políticas e o bucket (só se vazio).
drop policy if exists "social_media_insert" on storage.objects;
drop policy if exists "social_media_select" on storage.objects;
drop policy if exists "social_media_delete" on storage.objects;
-- Só remove o bucket se não houver objetos (evita perda de dados).
delete from storage.buckets b
where b.id = 'social-media'
  and not exists (select 1 from storage.objects o where o.bucket_id = 'social-media');
