-- ============================================================================
-- Migration: Standardize RLS policies to use helper functions
--
-- Replaces inline subqueries in RLS policies with optimized helper functions:
--   - user_has_org_access(org_id) for org-scoped tables
--   - current_user_id() for user-scoped tables
--   - is_admin_user() for admin-scoped tables
--
-- Impact: Eliminates per-row subquery re-execution in RLS evaluation.
--         Same fix as 20260412200000 but applied to remaining tables.
-- ============================================================================

-- =====================
-- 1. notifications
-- =====================
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (user_id = current_user_id());

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = current_user_id());

-- =====================
-- 2. subscription_usage
-- =====================
DROP POLICY IF EXISTS "Users can view org subscription usage" ON subscription_usage;
CREATE POLICY "Users can view org subscription usage" ON subscription_usage
  FOR SELECT USING (
    subscription_id IN (
      SELECT s.id FROM subscriptions s WHERE user_has_org_access(s.organization_id)
    )
  );
-- Note: subscription_usage doesn't have organization_id directly,
-- so we still need a subquery but now it uses the STABLE helper function.

-- =====================
-- 3. admin_sessions
-- =====================
DROP POLICY IF EXISTS "Admins can view own sessions" ON admin_sessions;
CREATE POLICY "Admins can view own sessions" ON admin_sessions
  FOR SELECT USING (
    admin_user_id IN (SELECT id FROM admin_users WHERE auth_user_id = auth.uid() AND is_active = true)
  );
-- Note: admin tables use a separate auth path (admin_users),
-- keeping auth.uid() here since is_admin_user() checks mfa_enabled which may be too strict for session viewing.

-- =====================
-- 4. admin_audit_logs
-- =====================
DROP POLICY IF EXISTS "Admins can insert audit logs" ON admin_audit_logs;
CREATE POLICY "Admins can insert audit logs" ON admin_audit_logs
  FOR INSERT WITH CHECK (is_admin_user());

-- =====================
-- 5. admin_notifications
-- =====================
DROP POLICY IF EXISTS "Admins can view own notifications" ON admin_notifications;
CREATE POLICY "Admins can view own notifications" ON admin_notifications
  FOR SELECT TO authenticated
  USING (admin_user_id IN (SELECT id FROM admin_users WHERE auth_user_id = auth.uid() AND is_active = true));

DROP POLICY IF EXISTS "Admins can update own notifications" ON admin_notifications;
CREATE POLICY "Admins can update own notifications" ON admin_notifications
  FOR UPDATE TO authenticated
  USING (admin_user_id IN (SELECT id FROM admin_users WHERE auth_user_id = auth.uid() AND is_active = true));

-- =====================
-- 6. user_sessions
-- =====================
DROP POLICY IF EXISTS "Users can manage own sessions" ON user_sessions;
CREATE POLICY "Users can manage own sessions" ON user_sessions
  FOR ALL USING (user_id = current_user_id());

-- =====================
-- 7. agent_pending_questions
-- =====================
DROP POLICY IF EXISTS "Users can view pending questions" ON agent_pending_questions;
CREATE POLICY "Users can view pending questions" ON agent_pending_questions
  FOR SELECT USING (user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Users can create pending questions" ON agent_pending_questions;
CREATE POLICY "Users can create pending questions" ON agent_pending_questions
  FOR INSERT WITH CHECK (user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Users can update pending questions" ON agent_pending_questions;
CREATE POLICY "Users can update pending questions" ON agent_pending_questions
  FOR UPDATE USING (user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Users can delete pending questions" ON agent_pending_questions;
CREATE POLICY "Users can delete pending questions" ON agent_pending_questions
  FOR DELETE USING (user_has_org_access(organization_id));

-- =====================
-- 8. ai_agent_versions
-- =====================
DROP POLICY IF EXISTS "Users can view versions of their org agents" ON ai_agent_versions;
CREATE POLICY "Users can view versions of their org agents" ON ai_agent_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ai_agents a
      WHERE a.id = ai_agent_versions.agent_id
      AND user_has_org_access(a.organization_id)
    )
  );

DROP POLICY IF EXISTS "Users can create versions for their org agents" ON ai_agent_versions;
CREATE POLICY "Users can create versions for their org agents" ON ai_agent_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_agents a
      WHERE a.id = ai_agent_versions.agent_id
      AND user_has_org_access(a.organization_id)
    )
  );
