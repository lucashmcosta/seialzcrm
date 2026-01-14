-- ===========================================
-- AI Agents Configuration Table
-- ===========================================
CREATE TABLE public.ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Identification
  name TEXT NOT NULL DEFAULT 'Agente SDR',
  agent_type TEXT NOT NULL DEFAULT 'sdr',
  
  -- Status
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Tone settings
  -- Options: 'professional', 'friendly', 'formal', 'casual', 'technical'
  tone TEXT NOT NULL DEFAULT 'professional',
  
  -- Goal settings
  -- Options: 'qualify_lead', 'schedule_meeting', 'answer_questions', 'support', 'custom'
  goal TEXT NOT NULL DEFAULT 'qualify_lead',
  
  -- Custom instructions (free text field)
  custom_instructions TEXT,
  
  -- Greeting message (first message from agent)
  greeting_message TEXT DEFAULT 'Olá! Sou o assistente virtual da empresa. Como posso ajudar?',
  
  -- Working hours configuration (JSON)
  working_hours JSONB DEFAULT '{
    "enabled": false,
    "timezone": "America/Sao_Paulo",
    "schedule": {
      "monday": {"start": "09:00", "end": "18:00"},
      "tuesday": {"start": "09:00", "end": "18:00"},
      "wednesday": {"start": "09:00", "end": "18:00"},
      "thursday": {"start": "09:00", "end": "18:00"},
      "friday": {"start": "09:00", "end": "18:00"},
      "saturday": null,
      "sunday": null
    }
  }'::jsonb,
  
  -- Out of hours message
  out_of_hours_message TEXT DEFAULT 'Obrigado pela mensagem! Nosso horário de atendimento é de segunda a sexta, das 9h às 18h. Retornaremos em breve!',
  
  -- Limits
  max_messages_per_conversation INTEGER DEFAULT 10,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- One org can only have one agent per type
  UNIQUE(organization_id, agent_type)
);

-- Enable RLS
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their org agents" 
ON public.ai_agents FOR SELECT 
USING (
  organization_id IN (
    SELECT uo.organization_id FROM user_organizations uo 
    JOIN users u ON u.id = uo.user_id 
    WHERE u.auth_user_id = auth.uid() AND uo.is_active = true
  )
);

CREATE POLICY "Users can insert agents for their org" 
ON public.ai_agents FOR INSERT 
WITH CHECK (
  organization_id IN (
    SELECT uo.organization_id FROM user_organizations uo 
    JOIN users u ON u.id = uo.user_id 
    WHERE u.auth_user_id = auth.uid() AND uo.is_active = true
  )
);

CREATE POLICY "Users can update their org agents" 
ON public.ai_agents FOR UPDATE 
USING (
  organization_id IN (
    SELECT uo.organization_id FROM user_organizations uo 
    JOIN users u ON u.id = uo.user_id 
    WHERE u.auth_user_id = auth.uid() AND uo.is_active = true
  )
);

CREATE POLICY "Users can delete their org agents" 
ON public.ai_agents FOR DELETE 
USING (
  organization_id IN (
    SELECT uo.organization_id FROM user_organizations uo 
    JOIN users u ON u.id = uo.user_id 
    WHERE u.auth_user_id = auth.uid() AND uo.is_active = true
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_ai_agents_updated_at
BEFORE UPDATE ON public.ai_agents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- AI Agent Logs Table
-- ===========================================
CREATE TABLE public.ai_agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.message_threads(id) ON DELETE SET NULL,
  
  -- Input and output messages
  input_message TEXT NOT NULL,
  output_message TEXT NOT NULL,
  
  -- Context used for debugging
  context_used JSONB,
  
  -- Metrics
  response_time_ms INTEGER,
  tokens_used INTEGER,
  model_used TEXT,
  
  -- Status
  status TEXT DEFAULT 'success',
  -- Options: 'success', 'error', 'skipped_out_of_hours', 'skipped_max_messages'
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_agent_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their org agent logs" 
ON public.ai_agent_logs FOR SELECT 
USING (
  organization_id IN (
    SELECT uo.organization_id FROM user_organizations uo 
    JOIN users u ON u.id = uo.user_id 
    WHERE u.auth_user_id = auth.uid() AND uo.is_active = true
  )
);

-- Create indexes for performance
CREATE INDEX idx_ai_agents_org_id ON public.ai_agents(organization_id);
CREATE INDEX idx_ai_agents_org_type ON public.ai_agents(organization_id, agent_type);
CREATE INDEX idx_ai_agent_logs_org_id ON public.ai_agent_logs(organization_id);
CREATE INDEX idx_ai_agent_logs_agent_id ON public.ai_agent_logs(agent_id);
CREATE INDEX idx_ai_agent_logs_created_at ON public.ai_agent_logs(created_at DESC);