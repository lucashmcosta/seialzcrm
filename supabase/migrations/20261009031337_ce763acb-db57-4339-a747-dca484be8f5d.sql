-- B1
INSERT INTO public.feature_flags (name, description, is_enabled, organization_ids)
SELECT 'rbac_v2', 'Permissões novas com equipes', false, '{}'::uuid[]
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE name = 'rbac_v2');

CREATE OR REPLACE FUNCTION public.rbac_v2_enabled(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT f.is_enabled OR _org = ANY(COALESCE(f.organization_ids,'{}'))
                   FROM feature_flags f WHERE f.name = 'rbac_v2' LIMIT 1), false)
$$;

CREATE OR REPLACE FUNCTION public.rbac_v2_set_global(_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (current_user NOT IN ('authenticated','anon') OR public.is_admin_user()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE feature_flags SET is_enabled = _on, updated_at = now() WHERE name = 'rbac_v2';
END $$;
REVOKE ALL ON FUNCTION public.rbac_v2_set_global(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rbac_v2_enabled(uuid) TO authenticated, service_role;

-- B2
ALTER TABLE public.permission_profiles ADD COLUMN IF NOT EXISTS permissions_v2 jsonb;

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX teams_org_name_uq ON public.teams (organization_id, lower(name));
CREATE UNIQUE INDEX teams_id_org_uq ON public.teams (id, organization_id);

CREATE TABLE public.team_members (
  team_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id),
  FOREIGN KEY (team_id, organization_id) REFERENCES public.teams(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX team_members_user_idx ON public.team_members (user_id, organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.teams TO service_role;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_teams(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_org_system_admin(_org) OR EXISTS (
    SELECT 1 FROM user_organizations uo JOIN permission_profiles p ON p.id = uo.permission_profile_id
    WHERE uo.organization_id = _org AND uo.user_id = public.current_user_id() AND uo.is_active
      AND COALESCE((p.permissions_v2 #>> '{administracao,usuarios}')::boolean, false))
$$;

CREATE POLICY "Members view teams" ON public.teams FOR SELECT TO authenticated
  USING (organization_id = ANY ((SELECT public.current_user_org_ids())::uuid[]));
CREATE POLICY "Managers write teams" ON public.teams FOR ALL TO authenticated
  USING (public.can_manage_teams(organization_id)) WITH CHECK (public.can_manage_teams(organization_id));
CREATE POLICY "Members view team members" ON public.team_members FOR SELECT TO authenticated
  USING (organization_id = ANY ((SELECT public.current_user_org_ids())::uuid[]));
CREATE POLICY "Managers write team members" ON public.team_members FOR ALL TO authenticated
  USING (public.can_manage_teams(organization_id)) WITH CHECK (public.can_manage_teams(organization_id));

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();