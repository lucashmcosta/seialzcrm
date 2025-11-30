-- ==========================================
-- ADMINS: Usuários administrativos
-- ==========================================
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  
  -- MFA (obrigatório)
  mfa_enabled BOOLEAN DEFAULT false NOT NULL,
  mfa_secret TEXT,
  mfa_backup_codes TEXT[],
  mfa_setup_completed_at TIMESTAMPTZ,
  
  -- Segurança
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  
  -- Auditoria
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_admin_users_auth_user_id ON admin_users(auth_user_id);
CREATE INDEX idx_admin_users_email ON admin_users(email);

-- ==========================================
-- SESSÕES ADMIN
-- ==========================================
CREATE TABLE admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  mfa_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX idx_admin_sessions_admin_user_id ON admin_sessions(admin_user_id);
CREATE INDEX idx_admin_sessions_expires_at ON admin_sessions(expires_at);

-- ==========================================
-- AUDIT LOG ADMIN
-- ==========================================
CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES admin_users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_admin_audit_logs_admin_user_id ON admin_audit_logs(admin_user_id);
CREATE INDEX idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX idx_admin_audit_logs_action ON admin_audit_logs(action);

-- ==========================================
-- MÉTRICAS DE USO POR ORGANIZAÇÃO
-- ==========================================
CREATE TABLE organization_usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Métricas de atividade
  last_user_activity_at TIMESTAMPTZ,
  total_contacts INTEGER DEFAULT 0,
  total_opportunities INTEGER DEFAULT 0,
  total_tasks INTEGER DEFAULT 0,
  actions_last_7_days INTEGER DEFAULT 0,
  actions_last_30_days INTEGER DEFAULT 0,
  
  -- Storage
  storage_used_bytes BIGINT DEFAULT 0,
  
  -- Última atualização
  calculated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(organization_id)
);

CREATE INDEX idx_org_usage_metrics_org_id ON organization_usage_metrics(organization_id);

-- ==========================================
-- FUNÇÕES
-- ==========================================

-- Verificar se é admin ativo
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users au
    WHERE au.auth_user_id = auth.uid()
    AND au.is_active = true
    AND au.mfa_enabled = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Atualizar métricas de uso
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
  -- Último acesso de qualquer usuário da org
  SELECT MAX(COALESCE(last_login_at, created_at))
  INTO v_last_activity
  FROM users u
  INNER JOIN user_organizations uo ON uo.user_id = u.id
  WHERE uo.organization_id = org_id AND uo.is_active = true;
  
  -- Totais
  SELECT COUNT(*) INTO v_contacts FROM contacts WHERE organization_id = org_id AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_opportunities FROM opportunities WHERE organization_id = org_id AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_tasks FROM tasks WHERE organization_id = org_id AND deleted_at IS NULL;
  
  -- Atividade nos últimos 7 e 30 dias
  SELECT COUNT(*) INTO v_actions_7d FROM activities 
    WHERE organization_id = org_id AND created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO v_actions_30d FROM activities 
    WHERE organization_id = org_id AND created_at >= now() - interval '30 days';
  
  -- Upsert
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Registrar tentativa de login falhada
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resetar tentativas após login bem-sucedido
CREATE OR REPLACE FUNCTION reset_admin_login_attempts(p_admin_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE admin_users SET
    failed_login_attempts = 0,
    locked_until = NULL,
    last_login_at = now()
  WHERE id = p_admin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- RLS POLÍTICAS
-- ==========================================

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admin_users" ON admin_users
  FOR SELECT USING (is_admin_user());

CREATE POLICY "Admins can update own record" ON admin_users
  FOR UPDATE USING (auth_user_id = auth.uid());

ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view own sessions" ON admin_sessions
  FOR SELECT USING (
    admin_user_id IN (SELECT id FROM admin_users WHERE auth_user_id = auth.uid())
  );

ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs" ON admin_audit_logs
  FOR SELECT USING (is_admin_user());

ALTER TABLE organization_usage_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view org metrics" ON organization_usage_metrics
  FOR SELECT USING (is_admin_user());

-- RLS: Admins podem ver TODAS as orgs
CREATE POLICY "Admins can view all organizations" ON organizations
  FOR SELECT USING (is_admin_user() OR user_has_org_access(id));

CREATE POLICY "Admins can view all contacts" ON contacts
  FOR SELECT USING (is_admin_user() OR (user_has_org_access(organization_id) AND deleted_at IS NULL));

CREATE POLICY "Admins can view all opportunities" ON opportunities
  FOR SELECT USING (is_admin_user() OR (user_has_org_access(organization_id) AND deleted_at IS NULL));

CREATE POLICY "Admins can view all subscriptions" ON subscriptions
  FOR SELECT USING (is_admin_user() OR user_has_org_access(organization_id));

CREATE POLICY "Admins can view all user_organizations" ON user_organizations
  FOR SELECT USING (
    is_admin_user() OR 
    (EXISTS (SELECT 1 FROM users WHERE users.id = user_organizations.user_id AND users.auth_user_id = auth.uid()) OR 
     user_has_org_access(organization_id))
  );

-- Trigger para atualizar updated_at
CREATE TRIGGER update_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();