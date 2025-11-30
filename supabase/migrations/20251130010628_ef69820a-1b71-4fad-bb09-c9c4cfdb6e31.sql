-- ==========================================
-- FASE 7: Trash/Recovery - RLS Policies
-- ==========================================

-- Contacts: Allow viewing deleted items in trash
CREATE POLICY "Users can view deleted contacts in trash"
ON contacts FOR SELECT
USING (
  user_has_org_access(organization_id) 
  AND deleted_at IS NOT NULL
);

-- Opportunities: Allow viewing deleted items in trash
CREATE POLICY "Users can view deleted opportunities in trash"
ON opportunities FOR SELECT
USING (
  user_has_org_access(organization_id) 
  AND deleted_at IS NOT NULL
);

-- Tasks: Allow viewing deleted items in trash
CREATE POLICY "Users can view deleted tasks in trash"
ON tasks FOR SELECT
USING (
  user_has_org_access(organization_id) 
  AND deleted_at IS NOT NULL
);

-- Companies: Allow viewing deleted items in trash
CREATE POLICY "Users can view deleted companies in trash"
ON companies FOR SELECT
USING (
  user_has_org_access(organization_id) 
  AND deleted_at IS NOT NULL
);

-- ==========================================
-- FASE 8: Real-time Notifications - Triggers
-- ==========================================

-- Enable Realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Function: Notify when task is assigned
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user_id from auth
  SELECT id INTO v_user_id FROM users WHERE auth_user_id = auth.uid();
  
  -- Only notify on assignment change (not on create from same user)
  IF (TG_OP = 'UPDATE' AND NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id)
     OR (TG_OP = 'INSERT' AND NEW.assigned_user_id != v_user_id AND NEW.assigned_user_id IS NOT NULL) THEN
    
    INSERT INTO notifications (
      user_id, organization_id, type, title, body,
      entity_type, entity_id
    ) VALUES (
      NEW.assigned_user_id, 
      NEW.organization_id,
      'task_assigned', 
      'Nova tarefa atribuída',
      'Você recebeu a tarefa: ' || NEW.title,
      'task', 
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger: Task assignment notification
DROP TRIGGER IF EXISTS task_assigned_notification ON tasks;
CREATE TRIGGER task_assigned_notification
AFTER INSERT OR UPDATE ON tasks
FOR EACH ROW 
WHEN (NEW.deleted_at IS NULL)
EXECUTE FUNCTION notify_task_assigned();

-- Function: Notify when opportunity is won
CREATE OR REPLACE FUNCTION notify_opportunity_won()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Only notify when status changes to won
  IF NEW.status = 'won' AND (OLD.status IS NULL OR OLD.status != 'won') THEN
    
    -- Notify owner if exists
    IF NEW.owner_user_id IS NOT NULL THEN
      INSERT INTO notifications (
        user_id, organization_id, type, title, body,
        entity_type, entity_id
      ) VALUES (
        NEW.owner_user_id, 
        NEW.organization_id,
        'opportunity_won', 
        '🎉 Oportunidade ganha!',
        'Parabéns! A oportunidade "' || NEW.title || '" foi marcada como ganha.',
        'opportunity', 
        NEW.id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger: Opportunity won notification
DROP TRIGGER IF EXISTS opportunity_won_notification ON opportunities;
CREATE TRIGGER opportunity_won_notification
AFTER UPDATE ON opportunities
FOR EACH ROW 
WHEN (NEW.deleted_at IS NULL)
EXECUTE FUNCTION notify_opportunity_won();

-- Function: Notify when new message is received
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_contact_owner_id UUID;
  v_contact_name TEXT;
BEGIN
  -- Get contact owner and name
  SELECT c.owner_user_id, c.full_name 
  INTO v_contact_owner_id, v_contact_name
  FROM message_threads mt
  JOIN contacts c ON c.id = mt.contact_id
  WHERE mt.id = NEW.thread_id;
  
  -- Only notify if message is from contact (inbound) and owner exists
  IF NEW.direction = 'inbound' AND v_contact_owner_id IS NOT NULL THEN
    INSERT INTO notifications (
      user_id, organization_id, type, title, body,
      entity_type, entity_id
    ) VALUES (
      v_contact_owner_id, 
      NEW.organization_id,
      'new_message', 
      'Nova mensagem recebida',
      v_contact_name || ' enviou uma mensagem',
      'message', 
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger: New message notification
DROP TRIGGER IF EXISTS new_message_notification ON messages;
CREATE TRIGGER new_message_notification
AFTER INSERT ON messages
FOR EACH ROW 
WHEN (NEW.deleted_at IS NULL)
EXECUTE FUNCTION notify_new_message();