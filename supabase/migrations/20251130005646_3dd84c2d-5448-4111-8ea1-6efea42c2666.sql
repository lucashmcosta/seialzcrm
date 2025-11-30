-- =====================================================
-- FASE 2: AUDIT LOG TRIGGERS E ACTIVITIES AUTOMÁTICAS
-- =====================================================

-- =====================================================
-- PARTE 1: TRIGGERS DE AUDIT LOG
-- =====================================================

-- Trigger para contacts
CREATE TRIGGER contacts_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON contacts
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- Trigger para opportunities
CREATE TRIGGER opportunities_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON opportunities
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- Trigger para tasks
CREATE TRIGGER tasks_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- =====================================================
-- PARTE 2: ACTIVITIES AUTOMÁTICAS - MENSAGENS
-- =====================================================

CREATE OR REPLACE FUNCTION create_message_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contact_id UUID;
  v_opportunity_id UUID;
BEGIN
  -- Buscar contact_id e opportunity_id do thread
  SELECT contact_id, opportunity_id 
  INTO v_contact_id, v_opportunity_id
  FROM message_threads 
  WHERE id = NEW.thread_id;
  
  -- Criar activity
  INSERT INTO activities (
    organization_id,
    contact_id,
    opportunity_id,
    activity_type,
    title,
    body,
    created_by_user_id,
    occurred_at
  ) VALUES (
    NEW.organization_id,
    v_contact_id,
    v_opportunity_id,
    'message',
    'Nova mensagem',
    LEFT(NEW.content, 200),
    NEW.sender_user_id,
    COALESCE(NEW.sent_at, now())
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER message_activity_trigger
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION create_message_activity();

-- =====================================================
-- PARTE 3: ACTIVITIES AUTOMÁTICAS - TASKS
-- =====================================================

CREATE OR REPLACE FUNCTION create_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO activities (
    organization_id,
    contact_id,
    opportunity_id,
    activity_type,
    title,
    body,
    created_by_user_id,
    occurred_at
  ) VALUES (
    NEW.organization_id,
    NEW.contact_id,
    NEW.opportunity_id,
    'task',
    'Tarefa criada: ' || NEW.title,
    NEW.description,
    NEW.created_by_user_id,
    now()
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_activity_trigger
AFTER INSERT ON tasks
FOR EACH ROW EXECUTE FUNCTION create_task_activity();

-- =====================================================
-- PARTE 4: ACTIVITIES AUTOMÁTICAS - CALL LOGS
-- =====================================================

CREATE OR REPLACE FUNCTION create_call_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_title TEXT;
  v_duration TEXT;
BEGIN
  -- Formatar duração
  IF NEW.duration_seconds IS NOT NULL THEN
    v_duration := (NEW.duration_seconds / 60)::text || ' min';
  ELSE
    v_duration := 'N/A';
  END IF;
  
  -- Título baseado na direção
  IF NEW.direction = 'outgoing' THEN
    v_title := 'Ligação realizada';
  ELSE
    v_title := 'Ligação recebida';
  END IF;
  
  INSERT INTO activities (
    organization_id,
    contact_id,
    opportunity_id,
    activity_type,
    title,
    body,
    created_by_user_id,
    occurred_at
  ) VALUES (
    NEW.organization_id,
    NEW.contact_id,
    NEW.opportunity_id,
    'call',
    v_title || ' (' || v_duration || ')',
    NEW.notes,
    NEW.user_id,
    COALESCE(NEW.started_at, now())
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER call_activity_trigger
AFTER INSERT ON calls
FOR EACH ROW EXECUTE FUNCTION create_call_activity();

-- =====================================================
-- PARTE 5: ACTIVITIES AUTOMÁTICAS - MUDANÇA DE STAGE
-- =====================================================

CREATE OR REPLACE FUNCTION create_stage_change_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_stage_name TEXT;
  v_new_stage_name TEXT;
  v_user_id UUID;
BEGIN
  -- Só executa se pipeline_stage_id mudou
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    -- Buscar nomes das stages
    SELECT name INTO v_old_stage_name FROM pipeline_stages WHERE id = OLD.pipeline_stage_id;
    SELECT name INTO v_new_stage_name FROM pipeline_stages WHERE id = NEW.pipeline_stage_id;
    
    -- Buscar user_id atual
    SELECT id INTO v_user_id FROM users WHERE auth_user_id = auth.uid();
    
    INSERT INTO activities (
      organization_id,
      contact_id,
      opportunity_id,
      activity_type,
      title,
      body,
      created_by_user_id,
      occurred_at
    ) VALUES (
      NEW.organization_id,
      NEW.contact_id,
      NEW.id,
      'pipeline_stage_change',
      'Stage alterado: ' || COALESCE(v_old_stage_name, 'N/A') || ' → ' || COALESCE(v_new_stage_name, 'N/A'),
      'Oportunidade "' || NEW.title || '" movida para ' || v_new_stage_name,
      v_user_id,
      now()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER opportunity_stage_change_trigger
AFTER UPDATE ON opportunities
FOR EACH ROW EXECUTE FUNCTION create_stage_change_activity();

-- =====================================================
-- PARTE 6: INDEXES DE PERFORMANCE
-- =====================================================

-- Indexes para contacts
CREATE INDEX IF NOT EXISTS idx_contacts_org_deleted ON contacts(organization_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_contacts_org_owner ON contacts(organization_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);

-- Indexes para opportunities
CREATE INDEX IF NOT EXISTS idx_opportunities_org_stage ON opportunities(organization_id, pipeline_stage_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_org_contact ON opportunities(organization_id, contact_id);

-- Indexes para activities
CREATE INDEX IF NOT EXISTS idx_activities_org_contact ON activities(organization_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_org_opportunity ON activities(organization_id, opportunity_id);

-- Indexes para tasks
CREATE INDEX IF NOT EXISTS idx_tasks_org_assigned ON tasks(organization_id, assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org_contact ON tasks(organization_id, contact_id);

-- Indexes para audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_entity ON audit_logs(organization_id, entity_type, entity_id);