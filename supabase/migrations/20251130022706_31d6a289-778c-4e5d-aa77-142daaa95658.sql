-- Adicionar política para usuários lerem seu próprio registro em admin_users
CREATE POLICY "Users can view own admin record" ON admin_users
  FOR SELECT USING (auth_user_id = auth.uid());

-- Adicionar política INSERT para admin_audit_logs
CREATE POLICY "Admins can insert audit logs" ON admin_audit_logs
  FOR INSERT WITH CHECK (
    admin_user_id IN (
      SELECT id FROM admin_users WHERE auth_user_id = auth.uid()
    )
  );