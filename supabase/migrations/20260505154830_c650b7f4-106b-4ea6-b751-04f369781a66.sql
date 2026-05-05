
-- 1. Drop legacy backup tables containing PII (no longer used per security findings)
DROP TABLE IF EXISTS public._cleanup_backup_a2_twins_20260421;
DROP TABLE IF EXISTS public._cleanup_backup_b_samename_20260421;

-- 2. Tighten ai_interaction_logs RLS: remove permissive 'true' policy, scope to org
DROP POLICY IF EXISTS "Service role full access on ai_interaction_logs" ON public.ai_interaction_logs;

-- Service role bypasses RLS automatically; add explicit org-scoped policy for end users
CREATE POLICY "Org members can view ai_interaction_logs"
ON public.ai_interaction_logs
FOR SELECT
TO authenticated
USING (organization_id = ANY (current_user_org_ids()));

-- 3. Tighten attachments storage INSERT: verify the path's first folder is a user's org
DROP POLICY IF EXISTS "Users can upload attachments in their org" ON storage.objects;
CREATE POLICY "Users can upload attachments in their org"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND ((storage.foldername(name))[1])::uuid = ANY (current_user_org_ids())
);

-- 4. Tighten integration-logos storage policies: admin-only writes
DROP POLICY IF EXISTS "Admins podem fazer upload de logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins podem atualizar logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins podem deletar logos" ON storage.objects;

CREATE POLICY "Admins podem fazer upload de logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'integration-logos' AND is_admin_user());

CREATE POLICY "Admins podem atualizar logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'integration-logos' AND is_admin_user())
WITH CHECK (bucket_id = 'integration-logos' AND is_admin_user());

CREATE POLICY "Admins podem deletar logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'integration-logos' AND is_admin_user());
