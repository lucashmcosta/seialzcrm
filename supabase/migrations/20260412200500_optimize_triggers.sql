-- ============================================================================
-- Migration: Optimize trigger functions
--
-- 1. handle_handoff_notification: Replace FOR loop with batch INSERT
-- 2. update_organization_usage_metrics: Combine 5 sequential queries into 1
-- ============================================================================

-- =====================
-- 1. handle_handoff_notification - batch INSERT instead of loop
-- =====================
CREATE OR REPLACE FUNCTION handle_handoff_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name text;
BEGIN
  -- Only fire when needs_human_attention changes from false/null to true
  IF NEW.needs_human_attention = true
     AND (OLD.needs_human_attention = false OR OLD.needs_human_attention IS NULL) THEN

    -- Get contact name
    SELECT full_name INTO v_contact_name
    FROM contacts WHERE id = NEW.contact_id;

    -- Batch insert notifications for ALL active org users (single INSERT)
    INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id)
    SELECT
      NEW.organization_id,
      uo.user_id,
      'handoff',
      'Conversa transferida para atendimento',
      'A conversa com ' || COALESCE(v_contact_name, 'contato') || ' precisa de atendimento humano',
      'message_thread',
      NEW.id
    FROM user_organizations uo
    WHERE uo.organization_id = NEW.organization_id
      AND uo.is_active = true;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================
-- 2. update_organization_usage_metrics - single query with subqueries
-- =====================
CREATE OR REPLACE FUNCTION update_organization_usage_metrics(org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO organization_usage_metrics (
    organization_id, last_user_activity_at, total_contacts,
    total_opportunities, total_tasks, actions_last_7_days,
    actions_last_30_days, calculated_at
  )
  SELECT
    org_id,
    (SELECT MAX(COALESCE(uo.updated_at, u.created_at))
     FROM users u
     INNER JOIN user_organizations uo ON uo.user_id = u.id
     WHERE uo.organization_id = org_id AND uo.is_active = true),
    (SELECT COUNT(*) FROM contacts WHERE organization_id = org_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM opportunities WHERE organization_id = org_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM tasks WHERE organization_id = org_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM activities WHERE organization_id = org_id AND created_at >= now() - interval '7 days'),
    (SELECT COUNT(*) FROM activities WHERE organization_id = org_id AND created_at >= now() - interval '30 days'),
    now()
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
