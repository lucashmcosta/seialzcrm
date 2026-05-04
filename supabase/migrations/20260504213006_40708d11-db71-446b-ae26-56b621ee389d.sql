UPDATE public.user_organizations
SET permission_profile_id = '2f5bd892-8392-43a9-8a03-325f25541747'
WHERE user_id = (SELECT id FROM public.users WHERE email = 'kvieira@viagi.com.br')
  AND organization_id = (
    SELECT organization_id FROM public.permission_profiles
    WHERE id = '2f5bd892-8392-43a9-8a03-325f25541747'
  )
  AND is_active = true;