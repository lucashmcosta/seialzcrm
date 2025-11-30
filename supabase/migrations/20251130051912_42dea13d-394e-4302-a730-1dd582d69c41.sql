-- Drop existing function
DROP FUNCTION IF EXISTS update_organization_usage_metrics(uuid);

-- Recreate with correct column reference (using updated_at from user_organizations or created_at from users)
CREATE OR REPLACE FUNCTION update_organization_usage_metrics(org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_last_activity TIMESTAMPTZ;
  v_contacts INTEGER;
  v_opportunities INTEGER;
  v_tasks INTEGER;
  v_actions_7d INTEGER;
  v_actions_30d INTEGER;
BEGIN
  -- Use updated_at from user_organizations or created_at from users
  SELECT MAX(COALESCE(uo.updated_at, u.created_at))
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
$$;