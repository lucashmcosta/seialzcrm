-- Allow organization managers to maintain permission profiles without opening
-- the table to ordinary members. The SECURITY DEFINER helper avoids recursive
-- RLS lookups on permission_profiles itself.
CREATE OR REPLACE FUNCTION public.can_manage_permission_profiles(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    LEFT JOIN public.user_organizations uo
      ON uo.user_id = u.id
     AND uo.organization_id = _organization_id
     AND uo.is_active = true
    LEFT JOIN public.permission_profiles pp
      ON pp.id = uo.permission_profile_id
    WHERE u.auth_user_id = auth.uid()
      AND (
        u.is_platform_admin = true
        OR (
          uo.id IS NOT NULL
          AND (
            COALESCE((pp.permissions->>'can_manage_users')::boolean, false)
            OR COALESCE((pp.permissions->>'can_manage_settings')::boolean, false)
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_permission_profiles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_permission_profiles(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Managers can manage permission profiles" ON public.permission_profiles;
CREATE POLICY "Managers can manage permission profiles"
  ON public.permission_profiles
  FOR ALL
  TO authenticated
  USING (public.can_manage_permission_profiles(organization_id))
  WITH CHECK (public.can_manage_permission_profiles(organization_id));

-- Existing integration/user managers are the safe compatibility population for
-- the new telephony administration permission. Explicit true values remain true;
-- ordinary profiles remain false.
UPDATE public.permission_profiles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'can_manage_telephony',
    COALESCE((permissions->>'can_manage_telephony')::boolean, false)
    OR COALESCE((permissions->>'can_manage_integrations')::boolean, false)
    OR COALESCE((permissions->>'can_manage_users')::boolean, false),
  'can_make_calls',
    COALESCE((permissions->>'can_make_calls')::boolean, false)
    OR COALESCE((permissions->>'can_manage_integrations')::boolean, false),
  'can_receive_calls',
    COALESCE((permissions->>'can_receive_calls')::boolean, false)
    OR COALESCE((permissions->>'can_manage_integrations')::boolean, false),
  'can_view_all_calls',
    COALESCE((permissions->>'can_view_all_calls')::boolean, false)
    OR COALESCE((permissions->>'view_all_contacts')::boolean, false)
    OR COALESCE((permissions->>'view_all_opportunities')::boolean, false)
    OR COALESCE((permissions->>'can_manage_integrations')::boolean, false)
);

-- The pilot was already scoped to Viagi. Enable only that organization now that
-- its administrative profile can reach and configure the telephony UI.
UPDATE public.feature_flags
SET
  organization_ids = ARRAY['b246ef6f-6242-4011-a112-6d8783d2896a'::uuid],
  is_enabled = true,
  updated_at = now()
WHERE name = 'telephony_v2';
