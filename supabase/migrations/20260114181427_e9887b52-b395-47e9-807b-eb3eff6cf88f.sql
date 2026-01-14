-- Tabela para mensagens agendadas pelo agente IA
CREATE TABLE public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.message_threads(id) ON DELETE SET NULL,
  
  -- Conteúdo
  content TEXT NOT NULL,
  channel TEXT DEFAULT 'whatsapp',
  
  -- Agendamento
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- pending, sent, failed, cancelled
  
  -- Contexto
  created_by TEXT DEFAULT 'agent',
  ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  reason TEXT,
  
  -- Controle de erros
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance do cron
CREATE INDEX idx_scheduled_messages_pending ON public.scheduled_messages(scheduled_at) 
  WHERE status = 'pending';
CREATE INDEX idx_scheduled_messages_org ON public.scheduled_messages(organization_id);
CREATE INDEX idx_scheduled_messages_contact ON public.scheduled_messages(contact_id);

-- RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view scheduled messages in their organization"
  ON public.scheduled_messages FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert scheduled messages in their organization"
  ON public.scheduled_messages FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update scheduled messages in their organization"
  ON public.scheduled_messages FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete scheduled messages in their organization"
  ON public.scheduled_messages FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Service role policy para o cron job
CREATE POLICY "Service role can manage all scheduled messages"
  ON public.scheduled_messages FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger para updated_at
CREATE TRIGGER update_scheduled_messages_updated_at
  BEFORE UPDATE ON public.scheduled_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();