-- Create audit log trigger function
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  -- Get user_id from auth.uid()
  SELECT id INTO v_user_id FROM users WHERE auth_user_id = auth.uid();
  
  -- Get organization_id from NEW or OLD record
  v_org_id := COALESCE(NEW.organization_id, OLD.organization_id);
  
  -- Insert audit log entry
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (
      organization_id,
      entity_type,
      entity_id,
      action,
      old_data,
      changed_by_user_id
    ) VALUES (
      v_org_id,
      TG_TABLE_NAME,
      OLD.id,
      'DELETE',
      to_jsonb(OLD),
      v_user_id
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (
      organization_id,
      entity_type,
      entity_id,
      action,
      old_data,
      new_data,
      changed_by_user_id
    ) VALUES (
      v_org_id,
      TG_TABLE_NAME,
      NEW.id,
      'UPDATE',
      to_jsonb(OLD),
      to_jsonb(NEW),
      v_user_id
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (
      organization_id,
      entity_type,
      entity_id,
      action,
      new_data,
      changed_by_user_id
    ) VALUES (
      v_org_id,
      TG_TABLE_NAME,
      NEW.id,
      'INSERT',
      to_jsonb(NEW),
      v_user_id
    );
    RETURN NEW;
  END IF;
END;
$$;

-- Create triggers for contacts
CREATE TRIGGER audit_contacts_insert
AFTER INSERT ON contacts
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_contacts_update
AFTER UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_contacts_delete
AFTER DELETE ON contacts
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- Create triggers for opportunities
CREATE TRIGGER audit_opportunities_insert
AFTER INSERT ON opportunities
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_opportunities_update
AFTER UPDATE ON opportunities
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_opportunities_delete
AFTER DELETE ON opportunities
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- Create triggers for tasks
CREATE TRIGGER audit_tasks_insert
AFTER INSERT ON tasks
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_tasks_update
AFTER UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_tasks_delete
AFTER DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();