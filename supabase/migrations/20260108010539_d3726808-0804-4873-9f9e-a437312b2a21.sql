-- Criar bucket específico para logos de organizações
INSERT INTO storage.buckets (id, name, public) 
VALUES ('organization-logos', 'organization-logos', true);

-- Política para upload (usuários autenticados)
CREATE POLICY "Authenticated users can upload org logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'organization-logos' AND auth.role() = 'authenticated');

-- Política para leitura pública
CREATE POLICY "Public can view org logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'organization-logos');

-- Política para update (usuários autenticados)
CREATE POLICY "Authenticated users can update org logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'organization-logos' AND auth.role() = 'authenticated');

-- Política para delete (usuários autenticados)
CREATE POLICY "Authenticated users can delete org logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'organization-logos' AND auth.role() = 'authenticated');