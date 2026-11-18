-- Fotos de perfil: pasta própria (antes iam para 'attachments', que só aceita a pasta da org e é privada,
-- então o envio falhava). Pública para exibir; cada usuário só grava/apaga na pasta com o próprio auth.uid().
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-avatars', 'user-avatars', true, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "user_avatars_insert_own" ON storage.objects;
CREATE POLICY "user_avatars_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "user_avatars_update_own" ON storage.objects;
CREATE POLICY "user_avatars_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'user-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "user_avatars_delete_own" ON storage.objects;
CREATE POLICY "user_avatars_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
