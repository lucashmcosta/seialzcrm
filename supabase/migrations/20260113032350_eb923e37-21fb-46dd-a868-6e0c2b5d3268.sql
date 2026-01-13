-- Create whatsapp-media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for whatsapp-media bucket
CREATE POLICY "Org members can view whatsapp media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'whatsapp-media' AND
  (storage.foldername(name))[1] IN (
    SELECT o.id::text FROM organizations o
    JOIN user_organizations uo ON uo.organization_id = o.id
    JOIN users u ON u.id = uo.user_id
    WHERE u.auth_user_id = auth.uid() AND uo.is_active = true
  )
);

CREATE POLICY "Org members can upload whatsapp media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media' AND
  (storage.foldername(name))[1] IN (
    SELECT o.id::text FROM organizations o
    JOIN user_organizations uo ON uo.organization_id = o.id
    JOIN users u ON u.id = uo.user_id
    WHERE u.auth_user_id = auth.uid() AND uo.is_active = true
  )
);

CREATE POLICY "Service role can manage whatsapp media"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'whatsapp-media')
WITH CHECK (bucket_id = 'whatsapp-media');

-- Add media_type column to messages table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'media_type'
  ) THEN
    ALTER TABLE public.messages 
    ADD COLUMN media_type TEXT 
    CHECK (media_type IN ('image', 'audio', 'video', 'document', 'sticker'));
  END IF;
END $$;