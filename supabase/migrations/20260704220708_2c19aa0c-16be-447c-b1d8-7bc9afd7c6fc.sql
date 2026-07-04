
-- 1. Tabela
CREATE TABLE public.compliance_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  endpoint_id uuid,
  thread_id uuid,
  contact_id uuid,
  template_id uuid,
  template_name text,
  block_reason text NOT NULL,
  window_state jsonb,
  attempted_by_user_id uuid,
  source_component text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_blocks_org_created ON public.compliance_blocks (organization_id, created_at DESC);
CREATE INDEX idx_compliance_blocks_endpoint_created ON public.compliance_blocks (endpoint_id, created_at DESC) WHERE endpoint_id IS NOT NULL;
CREATE INDEX idx_compliance_blocks_reason_created ON public.compliance_blocks (block_reason, created_at DESC);

-- 2. Grants (Data API não concede por padrão)
GRANT SELECT, INSERT ON public.compliance_blocks TO authenticated;
GRANT ALL ON public.compliance_blocks TO service_role;

-- 3. RLS
ALTER TABLE public.compliance_blocks ENABLE ROW LEVEL SECURITY;

-- Leitura: apenas da própria org (usa helper existente do projeto)
CREATE POLICY "compliance_blocks_select_own_org"
ON public.compliance_blocks
FOR SELECT
TO authenticated
USING (organization_id = ANY(public.current_user_org_ids()));

-- Escrita: qualquer usuário autenticado pode registrar um bloqueio da sua org.
-- Sem UPDATE/DELETE via API — log é imutável.
CREATE POLICY "compliance_blocks_insert_own_org"
ON public.compliance_blocks
FOR INSERT
TO authenticated
WITH CHECK (organization_id = ANY(public.current_user_org_ids()));
