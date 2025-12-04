-- Criar bucket público para logos de integrações
INSERT INTO storage.buckets (id, name, public)
VALUES ('integration-logos', 'integration-logos', true);

-- Política de leitura pública
CREATE POLICY "Logos públicas para leitura"
ON storage.objects FOR SELECT
USING (bucket_id = 'integration-logos');

-- Política de upload para admins autenticados
CREATE POLICY "Admins podem fazer upload de logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'integration-logos');

-- Política de update para admins
CREATE POLICY "Admins podem atualizar logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'integration-logos');

-- Política de delete para admins
CREATE POLICY "Admins podem deletar logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'integration-logos');