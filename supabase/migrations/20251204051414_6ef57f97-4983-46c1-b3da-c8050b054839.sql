-- Criar enum para tipo de chamada
DO $$ BEGIN
  CREATE TYPE call_type AS ENUM ('made', 'received', 'scheduled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Adicionar novas colunas à tabela calls
ALTER TABLE calls 
  ADD COLUMN IF NOT EXISTS call_type text DEFAULT 'made',
  ADD COLUMN IF NOT EXISTS call_sid TEXT,
  ADD COLUMN IF NOT EXISTS from_number TEXT,
  ADD COLUMN IF NOT EXISTS to_number TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_calls_call_sid ON calls(call_sid);
CREATE INDEX IF NOT EXISTS idx_calls_call_type ON calls(call_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_call_sid_unique ON calls(call_sid) WHERE call_sid IS NOT NULL;

-- Criar tabela call_recordings
CREATE TABLE IF NOT EXISTS call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  recording_sid TEXT UNIQUE NOT NULL,
  recording_url TEXT NOT NULL,
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  transcription TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para call_recordings
CREATE INDEX IF NOT EXISTS idx_call_recordings_call ON call_recordings(call_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_org ON call_recordings(organization_id);

-- RLS para call_recordings
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage call recordings in their org" 
ON call_recordings FOR ALL 
USING (user_has_org_access(organization_id));

-- Inserir integração Twilio Voice na tabela admin_integrations
INSERT INTO admin_integrations (
  name, 
  slug, 
  description, 
  category, 
  status,
  documentation_url,
  config_schema,
  sort_order
) VALUES (
  'Twilio Voice',
  'twilio-voice',
  'Faça e receba chamadas diretamente do CRM usando sua conta Twilio. Grave chamadas, acompanhe status em tempo real e mantenha histórico completo.',
  'telephony',
  'beta',
  'https://docs.twilio.com/docs/voice',
  '{
    "fields": [
      {
        "key": "account_sid",
        "label": "Account SID",
        "type": "text",
        "required": true,
        "placeholder": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "description": "Encontre no Twilio Console > Account Info"
      },
      {
        "key": "auth_token",
        "label": "Auth Token",
        "type": "password",
        "required": true,
        "description": "Token secreto da sua conta Twilio"
      },
      {
        "key": "phone_number",
        "label": "Número Twilio",
        "type": "text",
        "required": true,
        "placeholder": "+5511999999999",
        "description": "Número comprado no Twilio (formato E.164)"
      },
      {
        "key": "enable_recording",
        "label": "Gravar chamadas",
        "type": "checkbox",
        "required": false,
        "description": "Gravar automaticamente todas as chamadas"
      }
    ]
  }',
  1
) ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  config_schema = EXCLUDED.config_schema,
  status = EXCLUDED.status;