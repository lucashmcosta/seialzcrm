
-- =====================================================
-- Bloco 1: Status, Atribuição e Fluxo de Atendimento
-- =====================================================

-- 1. Novos campos na message_threads
ALTER TABLE message_threads ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE message_threads ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES users(id);
ALTER TABLE message_threads ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE message_threads ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE message_threads ADD COLUMN IF NOT EXISTS first_human_response_at timestamptz;

-- 2. Constraint de status
ALTER TABLE message_threads ADD CONSTRAINT message_threads_status_check 
  CHECK (status IN ('open', 'awaiting_client', 'resolved', 'closed'));

-- 3. Índices para performance dos filtros da inbox
CREATE INDEX IF NOT EXISTS idx_message_threads_status ON message_threads(status);
CREATE INDEX IF NOT EXISTS idx_message_threads_assigned_user ON message_threads(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_org_status ON message_threads(organization_id, status);

-- 4. INSERT policy para notifications (necessária para o trigger de handoff)
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- 5. Trigger: Auto-update status quando cliente envia mensagem inbound
CREATE OR REPLACE FUNCTION handle_inbound_message_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE message_threads
    SET status = 'open',
        updated_at = now()
    WHERE id = NEW.thread_id
      AND status IN ('awaiting_client', 'resolved');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inbound_message_status
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION handle_inbound_message_status();

-- 6. Trigger: Notificação de handoff (quando needs_human_attention muda para true)
CREATE OR REPLACE FUNCTION handle_handoff_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name text;
  v_user_record record;
BEGIN
  -- Só dispara quando needs_human_attention muda de false/null para true
  IF NEW.needs_human_attention = true AND (OLD.needs_human_attention = false OR OLD.needs_human_attention IS NULL) THEN
    -- Busca nome do contato
    SELECT full_name INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;
    
    -- Insere notificação para TODOS os usuários ativos da org
    FOR v_user_record IN 
      SELECT uo.user_id FROM user_organizations uo 
      WHERE uo.organization_id = NEW.organization_id AND uo.is_active = true
    LOOP
      INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id)
      VALUES (
        NEW.organization_id,
        v_user_record.user_id,
        'handoff',
        'Conversa transferida para atendimento',
        'A conversa com ' || COALESCE(v_contact_name, 'contato') || ' precisa de atendimento humano',
        'message_thread',
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handoff_notification
  AFTER UPDATE ON message_threads
  FOR EACH ROW
  EXECUTE FUNCTION handle_handoff_notification();
