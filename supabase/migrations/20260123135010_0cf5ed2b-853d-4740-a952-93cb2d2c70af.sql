-- Add new columns to ai_agents table for the refactored system
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS feedback_rules JSONB DEFAULT '[]';
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS tool_triggers JSONB;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS compliance_rules JSONB;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS agent_mode TEXT DEFAULT 'qualify';
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS empathy_level INTEGER DEFAULT 2;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;

-- Create ai_agent_versions table for versioning with rollback
CREATE TABLE ai_agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE NOT NULL,
  version_number INTEGER NOT NULL,
  
  -- Snapshot completo
  kernel_prompt TEXT,
  wizard_data JSONB,
  ai_provider TEXT,
  ai_model TEXT,
  enabled_tools JSONB,
  feedback_rules JSONB,
  tool_triggers JSONB,
  compliance_rules JSONB,
  
  -- Metadados
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id),
  change_note TEXT,
  is_rollback BOOLEAN DEFAULT false,
  rollback_from_version INTEGER,
  
  UNIQUE(agent_id, version_number)
);

-- Enable RLS on ai_agent_versions
ALTER TABLE ai_agent_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view versions of agents in their organization
CREATE POLICY "Users can view versions of their org agents" ON ai_agent_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ai_agents a
      WHERE a.id = ai_agent_versions.agent_id
      AND a.organization_id IN (SELECT unnest(current_user_org_ids()))
    )
  );

-- Policy: Users can insert versions for agents in their organization
CREATE POLICY "Users can create versions for their org agents" ON ai_agent_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_agents a
      WHERE a.id = ai_agent_versions.agent_id
      AND a.organization_id IN (SELECT unnest(current_user_org_ids()))
    )
  );

-- Create agent_pending_questions table for MISSING_INFO feedback
CREATE TABLE agent_pending_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  slot TEXT,
  source_feedback TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'dismissed')),
  answer TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  answered_at TIMESTAMPTZ
);

-- Enable RLS on agent_pending_questions
ALTER TABLE agent_pending_questions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage pending questions in their organization
CREATE POLICY "Users can view pending questions" ON agent_pending_questions
  FOR SELECT USING (organization_id IN (SELECT unnest(current_user_org_ids())));

CREATE POLICY "Users can create pending questions" ON agent_pending_questions
  FOR INSERT WITH CHECK (organization_id IN (SELECT unnest(current_user_org_ids())));

CREATE POLICY "Users can update pending questions" ON agent_pending_questions
  FOR UPDATE USING (organization_id IN (SELECT unnest(current_user_org_ids())));

CREATE POLICY "Users can delete pending questions" ON agent_pending_questions
  FOR DELETE USING (organization_id IN (SELECT unnest(current_user_org_ids())));