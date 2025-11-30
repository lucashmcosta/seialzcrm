-- Corrigir search_path das funções admin
CREATE OR REPLACE FUNCTION update_organization_usage_metrics(org_id UUID)
RETURNS VOID AS $$
DECLARE
  v_last_activity TIMESTAMPTZ;
  v_contacts INTEGER;
  v_opportunities INTEGER;
  v_tasks INTEGER;
  v_actions_7d INTEGER;
  v_actions_30d INTEGER;
BEGIN
  SELECT MAX(COALESCE(last_login_at, created_at))
  INTO v_last_activity
  FROM users u
  INNER JOIN user_organizations uo ON uo.user_id = u.id
  WHERE uo.organization_id = org_id AND uo.is_active = true;
  
  SELECT COUNT(*) INTO v_contacts FROM contacts WHERE organization_id = org_id AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_opportunities FROM opportunities WHERE organization_id = org_id AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_tasks FROM tasks WHERE organization_id = org_id AND deleted_at IS NULL;
  
  SELECT COUNT(*) INTO v_actions_7d FROM activities 
    WHERE organization_id = org_id AND created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO v_actions_30d FROM activities 
    WHERE organization_id = org_id AND created_at >= now() - interval '30 days';
  
  INSERT INTO organization_usage_metrics (
    organization_id, last_user_activity_at, total_contacts, 
    total_opportunities, total_tasks, actions_last_7_days, 
    actions_last_30_days, calculated_at
  )
  VALUES (
    org_id, v_last_activity, v_contacts, v_opportunities, 
    v_tasks, v_actions_7d, v_actions_30d, now()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    last_user_activity_at = EXCLUDED.last_user_activity_at,
    total_contacts = EXCLUDED.total_contacts,
    total_opportunities = EXCLUDED.total_opportunities,
    total_tasks = EXCLUDED.total_tasks,
    actions_last_7_days = EXCLUDED.actions_last_7_days,
    actions_last_30_days = EXCLUDED.actions_last_30_days,
    calculated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION record_failed_admin_login(p_email TEXT, p_ip TEXT)
RETURNS VOID AS $$
DECLARE
  v_admin_id UUID;
  v_attempts INTEGER;
BEGIN
  SELECT id, failed_login_attempts INTO v_admin_id, v_attempts
  FROM admin_users WHERE email = p_email;
  
  IF v_admin_id IS NOT NULL THEN
    v_attempts := v_attempts + 1;
    
    UPDATE admin_users SET
      failed_login_attempts = v_attempts,
      locked_until = CASE 
        WHEN v_attempts >= 5 THEN now() + interval '30 minutes'
        ELSE locked_until
      END
    WHERE id = v_admin_id;
    
    INSERT INTO admin_audit_logs (admin_user_id, action, details, ip_address)
    VALUES (v_admin_id, 'failed_login', jsonb_build_object('attempts', v_attempts), p_ip);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION reset_admin_login_attempts(p_admin_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE admin_users SET
    failed_login_attempts = 0,
    locked_until = NULL,
    last_login_at = now()
  WHERE id = p_admin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;