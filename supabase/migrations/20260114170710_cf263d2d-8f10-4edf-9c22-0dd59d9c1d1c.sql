-- Tabela de memórias por contato
CREATE TABLE public.contact_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Fatos importantes sobre o contato
  facts JSONB DEFAULT '[]'::JSONB,
  
  -- Próxima ação agendada
  next_action TEXT,
  next_action_date DATE,
  
  -- Qualificação do lead
  qualification JSONB DEFAULT '{}'::JSONB,
  
  -- Objeções levantadas
  objections JSONB DEFAULT '[]'::JSONB,
  
  -- Preferências de contato
  preferences JSONB DEFAULT '{}'::JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(contact_id)
);

-- Índices
CREATE INDEX idx_contact_memories_contact ON public.contact_memories(contact_id);
CREATE INDEX idx_contact_memories_org ON public.contact_memories(organization_id);
CREATE INDEX idx_contact_memories_next_action ON public.contact_memories(next_action_date) 
  WHERE next_action_date IS NOT NULL;

-- RLS
ALTER TABLE public.contact_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage contact memories in their org"
ON public.contact_memories FOR ALL
USING (user_has_org_access(organization_id));

-- Trigger para updated_at
CREATE TRIGGER update_contact_memories_updated_at
BEFORE UPDATE ON public.contact_memories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();