-- Tabela de logs de uso de IA para tracking de custos e auditoria
CREATE TABLE public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id),
  integration_slug TEXT NOT NULL,
  model_used TEXT NOT NULL,
  action TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  entity_type TEXT,
  entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index para queries comuns
CREATE INDEX idx_ai_usage_logs_org_created ON public.ai_usage_logs(organization_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view AI logs in their org" 
  ON public.ai_usage_logs FOR SELECT
  USING (user_has_org_access(organization_id));

CREATE POLICY "System can insert AI logs" 
  ON public.ai_usage_logs FOR INSERT
  WITH CHECK (user_has_org_access(organization_id));