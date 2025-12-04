-- Parte 1: Atualizar perfis Admin existentes para incluir novas permissões
UPDATE permission_profiles
SET permissions = permissions || 
  '{"can_manage_integrations": true, "can_manage_billing": true}'::jsonb
WHERE name = 'Admin'
  AND (
    (permissions->>'can_manage_integrations') IS NULL 
    OR (permissions->>'can_manage_billing') IS NULL
  );

-- Parte 2: Recriar função handle_new_user com permissões atualizadas
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  
  -- Criar perfis de permissão COM novas permissões
  INSERT INTO permission_profiles (organization_id, name, permissions)
  VALUES (v_org_id, 'Admin', '{"can_view_contacts":true,"can_edit_contacts":true,"can_delete_contacts":true,"can_view_opportunities":true,"can_edit_opportunities":true,"can_delete_opportunities":true,"can_manage_settings":true,"can_manage_users":true,"can_manage_integrations":true,"can_manage_billing":true}'::jsonb)
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
$function$;

-- Parte 3: Recriar função handle_user_signup com permissões atualizadas
CREATE OR REPLACE FUNCTION public.handle_user_signup(p_full_name text, p_email text, p_organization_name text, p_locale text DEFAULT 'pt-BR'::text, p_timezone text DEFAULT 'America/Sao_Paulo'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_user_id UUID;
  v_user_id UUID;
  v_org_id UUID;
  v_admin_profile_id UUID;
  v_slug TEXT;
BEGIN
  -- Get the authenticated user's ID
  v_auth_user_id := auth.uid();
  
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Generate slug from organization name
  v_slug := lower(regexp_replace(p_organization_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  
  -- Create user record
  INSERT INTO users (auth_user_id, email, full_name, first_name, last_name, locale, timezone)
  VALUES (
    v_auth_user_id,
    p_email,
    p_full_name,
    split_part(p_full_name, ' ', 1),
    NULLIF(substring(p_full_name from position(' ' in p_full_name) + 1), ''),
    p_locale,
    p_timezone
  )
  RETURNING id INTO v_user_id;
  
  -- Create organization
  INSERT INTO organizations (name, slug, default_currency, default_locale, timezone, onboarding_step)
  VALUES (p_organization_name, v_slug, 'BRL', p_locale, p_timezone, 'first_contact')
  RETURNING id INTO v_org_id;
  
  -- Create Admin permission profile COM novas permissões
  INSERT INTO permission_profiles (organization_id, name, permissions)
  VALUES (v_org_id, 'Admin', '{"can_view_contacts":true,"can_edit_contacts":true,"can_delete_contacts":true,"can_view_opportunities":true,"can_edit_opportunities":true,"can_delete_opportunities":true,"can_manage_settings":true,"can_manage_users":true,"can_manage_integrations":true,"can_manage_billing":true}'::jsonb)
  RETURNING id INTO v_admin_profile_id;
  
  -- Create Sales Rep profile
  INSERT INTO permission_profiles (organization_id, name, permissions)
  VALUES (v_org_id, 'Sales Rep', '{"can_view_contacts":true,"can_edit_contacts":true,"can_view_opportunities":true,"can_edit_opportunities":true}'::jsonb);
  
  -- Create user organization membership
  INSERT INTO user_organizations (user_id, organization_id, permission_profile_id, is_active)
  VALUES (v_user_id, v_org_id, v_admin_profile_id, true);
  
  -- Create subscription
  INSERT INTO subscriptions (organization_id, plan_name, status, is_free_plan, max_seats)
  VALUES (v_org_id, 'free', 'trialing', true, 3);
  
  -- Create default pipeline stages
  INSERT INTO pipeline_stages (organization_id, name, order_index, type) VALUES
    (v_org_id, 'Novo', 1, 'custom'),
    (v_org_id, 'Em negociação', 2, 'custom'),
    (v_org_id, 'Ganho', 100, 'won'),
    (v_org_id, 'Perdido', 101, 'lost');
  
  RETURN json_build_object(
    'user_id', v_user_id,
    'organization_id', v_org_id,
    'success', true
  );
END;
$function$;