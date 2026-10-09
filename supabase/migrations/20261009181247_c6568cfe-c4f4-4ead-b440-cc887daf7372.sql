ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS cs_round_robin_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.cs_round_robin_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT false,
  last_assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_round_robin_members TO authenticated;
GRANT ALL ON public.cs_round_robin_members TO service_role;
ALTER TABLE public.cs_round_robin_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_cs_round_robin(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_org_system_admin(_org)
      OR COALESCE((public.my_perms_v2(_org) #>> '{administracao,distribuicao}')::boolean, false)
      OR COALESCE((public.my_perms_v2(_org) #>> '{administracao,config_atendimento}')::boolean, false)
$$;

CREATE POLICY "cs_rr_members_read" ON public.cs_round_robin_members FOR SELECT TO authenticated
  USING (organization_id = ANY(public.current_user_org_ids()));
CREATE POLICY "cs_rr_members_insert" ON public.cs_round_robin_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_cs_round_robin(organization_id));
CREATE POLICY "cs_rr_members_update" ON public.cs_round_robin_members FOR UPDATE TO authenticated
  USING (public.can_manage_cs_round_robin(organization_id)) WITH CHECK (public.can_manage_cs_round_robin(organization_id));
CREATE POLICY "cs_rr_members_delete" ON public.cs_round_robin_members FOR DELETE TO authenticated
  USING (public.can_manage_cs_round_robin(organization_id));
CREATE TRIGGER update_cs_round_robin_members_updated_at BEFORE UPDATE ON public.cs_round_robin_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Registro de erros da regra nova (nunca bloqueia a ingestão). Só servidor.
CREATE TABLE public.cs_routing_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  thread_id uuid,
  stage text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cs_routing_errors TO service_role;
ALTER TABLE public.cs_routing_errors ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.perms_v2_for_user(_org uuid, _user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p.is_system THEN public.rbac_full_perms()
         ELSE COALESCE(p.permissions_v2, public.fn_permissions_from_legacy(COALESCE(p.permissions,'{}'),
              COALESCE(o.private_records_enabled,false), public.telephony_v2_enabled_for_org(o.id))) END
  FROM public.user_organizations uo
  JOIN public.permission_profiles p ON p.id = uo.permission_profile_id
  JOIN public.organizations o ON o.id = uo.organization_id
  WHERE uo.user_id = _user AND uo.organization_id = _org AND uo.is_active
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.perms_v2_for_user(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_receive_cs(_org uuid, _user uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p jsonb; v_on boolean;
BEGIN
  IF _org IS NULL OR _user IS NULL THEN RETURN false; END IF;
  p := public.perms_v2_for_user(_org, _user);
  IF p IS NULL THEN RETURN false; END IF;
  IF COALESCE(p #>> '{dados,atendimentos,ver}','nenhum') = 'nenhum'
     OR COALESCE(p #>> '{dados,atendimentos,editar}','nenhum') = 'nenhum' THEN RETURN false; END IF;
  SELECT cs_round_robin_enabled INTO v_on FROM public.organizations WHERE id = _org;
  IF COALESCE(v_on,false) THEN
    RETURN EXISTS (SELECT 1 FROM public.cs_round_robin_members m
                   WHERE m.organization_id = _org AND m.user_id = _user AND m.active);
  END IF;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.can_receive_cs(uuid, uuid) FROM PUBLIC, anon;