-- Função que será chamada quando um novo usuário é criado no auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_admin_profile_id UUID;
  v_org_name TEXT;
  v_full_name TEXT;
  v_slug TEXT;
BEGIN
  -- Extrair dados do metadata
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'User');
  v_org_name := COALESCE(NEW.raw_user_meta_data->>'organization_name', 'Minha Empresa');
  
  -- Gerar slug único
  v_slug := lower(regexp_replace(v_org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug) || '-' || substr(NEW.id::text, 1, 8);
  
  -- Criar registro de usuário
  INSERT INTO users (auth_user_id, email, full_name, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    split_part(v_full_name, ' ', 1),
    CASE WHEN position(' ' in v_full_name) > 0 
         THEN substring(v_full_name from position(' ' in v_full_name) + 1)
         ELSE NULL END
  )
  RETURNING id INTO v_user_id;
  
  -- Criar organização
  INSERT INTO organizations (name, slug, onboarding_step)
  VALUES (v_org_name, v_slug, 'first_contact')
  RETURNING id INTO v_org_id;
  
  -- Criar perfis de permissão
  INSERT INTO permission_profiles (organization_id, name, permissions)
  VALUES (v_org_id, 'Admin', '{"can_view_contacts":true,"can_edit_contacts":true,"can_delete_contacts":true,"can_view_opportunities":true,"can_edit_opportunities":true,"can_delete_opportunities":true,"can_manage_settings":true,"can_manage_users":true}'::jsonb)
  RETURNING id INTO v_admin_profile_id;
  
  INSERT INTO permission_profiles (organization_id, name, permissions)
  VALUES (v_org_id, 'Sales Rep', '{"can_view_contacts":true,"can_edit_contacts":true,"can_view_opportunities":true,"can_edit_opportunities":true}'::jsonb);
  
  -- Vincular usuário à organização
  INSERT INTO user_organizations (user_id, organization_id, permission_profile_id)
  VALUES (v_user_id, v_org_id, v_admin_profile_id);
  
  -- Criar subscription
  INSERT INTO subscriptions (organization_id, plan_name, status, is_free_plan, max_seats)
  VALUES (v_org_id, 'free', 'trialing', true, 3);
  
  -- Criar pipeline stages padrão
  INSERT INTO pipeline_stages (organization_id, name, order_index, type) VALUES
    (v_org_id, 'Novo', 1, 'custom'),
    (v_org_id, 'Em negociação', 2, 'custom'),
    (v_org_id, 'Ganho', 100, 'won'),
    (v_org_id, 'Perdido', 101, 'lost');
  
  RETURN NEW;
END;
$$;

-- Criar o trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();