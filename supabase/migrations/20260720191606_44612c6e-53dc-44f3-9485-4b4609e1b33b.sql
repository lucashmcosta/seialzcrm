
-- =========================================================================
-- Fase 2 — Evolution API: preparação estrutural aditiva
-- Requisitos: inerte em produção, sem tocar em Meta/Twilio, messaging_lines
-- ou endpoints existentes. Nenhum tenant habilitado.
-- =========================================================================

-- 1. Ampliar CHECK de provider (aditivo — apenas expande o conjunto permitido)
ALTER TABLE public.communication_endpoints
  DROP CONSTRAINT IF EXISTS communication_endpoints_provider_check;

ALTER TABLE public.communication_endpoints
  ADD CONSTRAINT communication_endpoints_provider_check
  CHECK (
    provider IS NULL
    OR provider = ANY (ARRAY[
      'twilio'::text,
      'meta_cloud_api'::text,
      'meta_cloud_api_coexistence'::text,
      '360dialog'::text,
      'seialz'::text,
      'evolution_api'::text,
      'other'::text
    ])
  );

-- 2. Tabela evolution_instances (1:1 com communication_endpoints)
CREATE TABLE public.evolution_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL UNIQUE REFERENCES public.communication_endpoints(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL UNIQUE,
  instance_id_remote TEXT,
  integration TEXT NOT NULL DEFAULT 'WHATSAPP-BAILEYS',
  last_known_state TEXT,
  last_state_checked_at TIMESTAMPTZ,
  last_qr_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evolution_instances_integration_check
    CHECK (integration = ANY (ARRAY['WHATSAPP-BAILEYS'::text, 'WHATSAPP-BUSINESS'::text])),
  CONSTRAINT evolution_instances_state_check
    CHECK (
      last_known_state IS NULL
      OR last_known_state = ANY (ARRAY['open'::text, 'connecting'::text, 'close'::text, 'unknown'::text])
    )
);

CREATE INDEX idx_evolution_instances_org ON public.evolution_instances(organization_id);
CREATE INDEX idx_evolution_instances_state ON public.evolution_instances(last_known_state);

-- GRANTs obrigatórios (RLS não substitui)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_instances TO authenticated;
GRANT ALL ON public.evolution_instances TO service_role;

ALTER TABLE public.evolution_instances ENABLE ROW LEVEL SECURITY;

-- Membros da organização veem/gerenciam apenas as próprias instâncias
CREATE POLICY "Org members can view own evolution instances"
  ON public.evolution_instances
  FOR SELECT
  TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));

CREATE POLICY "Org members can insert own evolution instances"
  ON public.evolution_instances
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = ANY (public.current_user_org_ids()));

CREATE POLICY "Org members can update own evolution instances"
  ON public.evolution_instances
  FOR UPDATE
  TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()))
  WITH CHECK (organization_id = ANY (public.current_user_org_ids()));

CREATE POLICY "Org members can delete own evolution instances"
  ON public.evolution_instances
  FOR DELETE
  TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));

-- Trigger de updated_at (função pública já existe: update_updated_at_column)
CREATE TRIGGER update_evolution_instances_updated_at
  BEFORE UPDATE ON public.evolution_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.evolution_instances IS
  'Fase 2 Evolution API: estado operacional 1:1 por endpoint. Nao armazena credenciais. Inerte ate Fase 3.';
COMMENT ON COLUMN public.evolution_instances.instance_name IS
  'Identificador fisico da instancia no servidor Evolution. Gerado pelo backend, imutavel apos criacao.';
COMMENT ON COLUMN public.evolution_instances.last_known_state IS
  'Ultimo estado conhecido via poll de /instance/connectionState. Nao e tempo real.';

-- 3. Feature flag DESLIGADA e SEM organizacoes habilitadas
INSERT INTO public.feature_flags (name, description, is_enabled, organization_ids)
VALUES (
  'evolution_api_enabled',
  'Fase 2: gate para o provider Evolution API. Desligada por padrao. Nenhuma organizacao habilitada. Nao consumida por dispatcher/UI ate Fase 3+.',
  false,
  ARRAY[]::uuid[]
)
ON CONFLICT (name) DO NOTHING;
