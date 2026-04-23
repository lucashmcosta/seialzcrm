DO $$
DECLARE
  v_auth_user_id uuid;
  v_user_id uuid;
  v_existing_auth_id uuid;
  v_subscription_id uuid;
  v_auto_org_id uuid;
BEGIN
  SELECT id INTO v_existing_auth_id FROM auth.users WHERE email = 'lmoreira@blueviza.com';
  IF v_existing_auth_id IS NOT NULL THEN
    RAISE EXCEPTION 'User already exists in auth.users (id=%)', v_existing_auth_id;
  END IF;

  v_auth_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_auth_user_id, 'authenticated', 'authenticated',
    'lmoreira@blueviza.com', crypt('123456', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Luana Moreira"}'::jsonb,
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_auth_user_id,
    jsonb_build_object('sub', v_auth_user_id::text, 'email', 'lmoreira@blueviza.com', 'email_verified', true),
    'email', v_auth_user_id::text, now(), now(), now()
  );

  SELECT id INTO v_user_id FROM users WHERE auth_user_id = v_auth_user_id;
  
  IF v_user_id IS NULL THEN
    INSERT INTO users (auth_user_id, email, full_name, first_name, last_name)
    VALUES (v_auth_user_id, 'lmoreira@blueviza.com', 'Luana Moreira', 'Luana', 'Moreira')
    RETURNING id INTO v_user_id;
  ELSE
    UPDATE users 
    SET full_name = 'Luana Moreira', first_name = 'Luana', last_name = 'Moreira'
    WHERE id = v_user_id;
    
    -- Limpar org auto-criada pelo trigger handle_new_user
    SELECT organization_id INTO v_auto_org_id
    FROM user_organizations
    WHERE user_id = v_user_id
      AND organization_id <> 'f677a500-6067-436e-aeda-300f7adc26ab'
    LIMIT 1;
    
    IF v_auto_org_id IS NOT NULL THEN
      -- Ordem correta: vínculos primeiro, depois profiles, depois subscription, depois org
      DELETE FROM user_organizations WHERE organization_id = v_auto_org_id;
      DELETE FROM subscription_usage WHERE subscription_id IN (SELECT id FROM subscriptions WHERE organization_id = v_auto_org_id);
      DELETE FROM subscriptions WHERE organization_id = v_auto_org_id;
      DELETE FROM pipeline_stages WHERE organization_id = v_auto_org_id;
      DELETE FROM permission_profiles WHERE organization_id = v_auto_org_id;
      DELETE FROM organizations WHERE id = v_auto_org_id;
    END IF;
  END IF;

  -- Vincular à Blueviza
  INSERT INTO user_organizations (user_id, organization_id, permission_profile_id, is_active)
  VALUES (v_user_id, 'f677a500-6067-436e-aeda-300f7adc26ab', 'ebcc223d-1ad1-4bbb-9d93-dd64fc2287b2', true)
  ON CONFLICT DO NOTHING;

  -- Atualizar contagem de assentos
  SELECT id INTO v_subscription_id FROM subscriptions WHERE organization_id = 'f677a500-6067-436e-aeda-300f7adc26ab';
  UPDATE subscription_usage
  SET current_seat_count = (
    SELECT COUNT(*) FROM user_organizations 
    WHERE organization_id = 'f677a500-6067-436e-aeda-300f7adc26ab' AND is_active = true
  ), last_calculated_at = now()
  WHERE subscription_id = v_subscription_id;

  RAISE NOTICE 'Luana created: auth_id=%, user_id=%', v_auth_user_id, v_user_id;
END $$;