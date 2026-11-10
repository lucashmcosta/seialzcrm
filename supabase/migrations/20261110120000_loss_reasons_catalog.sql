-- Motivos de perda em dois níveis (motivo → detalhe), cadastro por organização.
-- O código é o identificador fixo usado por relatórios, automações e API; o nome pode mudar à vontade.
-- Regras de "já usado" (código imutável, não apagar) ficam em 20261110120200, junto do histórico de perdas.
-- Rollback: supabase/rollback/20261110120000_loss_reasons_catalog_DOWN.sql


-- Quem administra o cadastro, as regras gerais e as regras por etapa:
-- perfil de sistema da org ou quem tem Administração → Configurações.
CREATE OR REPLACE FUNCTION public.can_manage_loss_reasons(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_org_system_admin(_org)
      OR COALESCE((public.my_perms_v2(_org) #>> '{administracao,config}')::boolean, false);
$$;
REVOKE ALL ON FUNCTION public.can_manage_loss_reasons(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_loss_reasons(uuid) TO authenticated, service_role;

CREATE TABLE public.opportunity_loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9_.-]{1,20}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
-- Único na org sem diferenciar maiúsculas; inativos continuam ocupando o código (não é reaproveitado).
CREATE UNIQUE INDEX opportunity_loss_reasons_org_code_key
  ON public.opportunity_loss_reasons (organization_id, upper(code));
CREATE INDEX opportunity_loss_reasons_org_order_idx
  ON public.opportunity_loss_reasons (organization_id, order_index);

CREATE TABLE public.opportunity_loss_reason_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  reason_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9_.-]{1,20}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  help_text text CHECK (help_text IS NULL OR (length(help_text) <= 200 AND help_text !~ '[\r\n]')),
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  requires_description boolean NOT NULL DEFAULT false,
  -- true = só automação/agente/API marcam; não aparece para pessoas escolherem
  automation_only boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (reason_id, organization_id)
    REFERENCES public.opportunity_loss_reasons (id, organization_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id),
  UNIQUE (id, reason_id)
);
CREATE UNIQUE INDEX opportunity_loss_reason_details_org_code_key
  ON public.opportunity_loss_reason_details (organization_id, upper(code));
CREATE INDEX opportunity_loss_reason_details_reason_order_idx
  ON public.opportunity_loss_reason_details (reason_id, order_index);

-- Carimbo de autoria/atualização (mesmo padrão de fn_touch_opportunity_close_policy).
CREATE OR REPLACE FUNCTION public.fn_touch_loss_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    NEW.updated_by := public.current_user_id();
    IF TG_OP = 'INSERT' THEN NEW.created_by := public.current_user_id(); END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_touch_loss_catalog() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_touch_opportunity_loss_reasons
BEFORE INSERT OR UPDATE ON public.opportunity_loss_reasons
FOR EACH ROW EXECUTE FUNCTION public.fn_touch_loss_catalog();
CREATE TRIGGER trg_touch_opportunity_loss_reason_details
BEFORE INSERT OR UPDATE ON public.opportunity_loss_reason_details
FOR EACH ROW EXECUTE FUNCTION public.fn_touch_loss_catalog();

-- Detalhe não muda de motivo nem de org: cria-se outro e inativa-se o antigo.
CREATE OR REPLACE FUNCTION public.fn_guard_loss_detail_reason()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.reason_id IS DISTINCT FROM OLD.reason_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'loss_detail_reason_immutable' USING ERRCODE = '23514',
      HINT = 'Detalhe não muda de motivo. Crie um novo detalhe no motivo certo e inative este.';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_guard_loss_detail_reason() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_loss_detail_reason
BEFORE UPDATE OF reason_id, organization_id ON public.opportunity_loss_reason_details
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_loss_detail_reason();

CREATE OR REPLACE FUNCTION public.fn_guard_loss_reason_org()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'loss_reason_org_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_guard_loss_reason_org() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_loss_reason_org
BEFORE UPDATE OF organization_id ON public.opportunity_loss_reasons
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_loss_reason_org();

ALTER TABLE public.opportunity_loss_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_loss_reason_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY opportunity_loss_reasons_select ON public.opportunity_loss_reasons
  FOR SELECT TO authenticated USING (organization_id = ANY(public.current_user_org_ids()));
CREATE POLICY opportunity_loss_reasons_insert ON public.opportunity_loss_reasons
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_loss_reasons(organization_id));
CREATE POLICY opportunity_loss_reasons_update ON public.opportunity_loss_reasons
  FOR UPDATE TO authenticated
  USING (public.can_manage_loss_reasons(organization_id))
  WITH CHECK (public.can_manage_loss_reasons(organization_id));
CREATE POLICY opportunity_loss_reasons_delete ON public.opportunity_loss_reasons
  FOR DELETE TO authenticated USING (public.can_manage_loss_reasons(organization_id));

CREATE POLICY opportunity_loss_reason_details_select ON public.opportunity_loss_reason_details
  FOR SELECT TO authenticated USING (organization_id = ANY(public.current_user_org_ids()));
CREATE POLICY opportunity_loss_reason_details_insert ON public.opportunity_loss_reason_details
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_loss_reasons(organization_id));
CREATE POLICY opportunity_loss_reason_details_update ON public.opportunity_loss_reason_details
  FOR UPDATE TO authenticated
  USING (public.can_manage_loss_reasons(organization_id))
  WITH CHECK (public.can_manage_loss_reasons(organization_id));
CREATE POLICY opportunity_loss_reason_details_delete ON public.opportunity_loss_reason_details
  FOR DELETE TO authenticated USING (public.can_manage_loss_reasons(organization_id));

REVOKE ALL ON public.opportunity_loss_reasons, public.opportunity_loss_reason_details FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_loss_reasons, public.opportunity_loss_reason_details TO authenticated;
GRANT ALL ON public.opportunity_loss_reasons, public.opportunity_loss_reason_details TO service_role;

