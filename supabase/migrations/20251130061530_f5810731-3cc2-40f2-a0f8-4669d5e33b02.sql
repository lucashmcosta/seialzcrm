-- 1. Atualizar estrutura da tabela plans para modelo per-seat
ALTER TABLE plans RENAME COLUMN price_monthly TO price_per_seat_monthly;
ALTER TABLE plans RENAME COLUMN price_yearly TO price_per_seat_yearly;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS free_seats_limit integer DEFAULT NULL;

-- 2. Atualizar dados dos planos existentes
UPDATE plans SET 
  free_seats_limit = 3,
  max_seats = NULL
WHERE name = 'free';

UPDATE plans SET 
  max_seats = NULL,
  free_seats_limit = NULL
WHERE name IN ('starter', 'pro', 'enterprise');

-- 3. Criar tabela para controle de sessões por device
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  user_agent text,
  UNIQUE(user_id, device_id)
);

-- 4. Habilitar RLS na tabela user_sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- 5. Criar policy para usuários gerenciarem próprias sessões
CREATE POLICY "Users can manage own sessions" 
ON user_sessions 
FOR ALL 
USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));