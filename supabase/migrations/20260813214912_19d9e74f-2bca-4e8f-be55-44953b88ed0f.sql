-- =====================================================================
-- Switch "Responder por" (Comercial) — infraestrutura, feature OFF.
-- Nenhum backfill. Nenhuma org habilitada. Sem write direto p/ authenticated.
-- =====================================================================

-- 1) Elegibilidade Comercial: endpoint precisa estar vinculado (link ativo)
--    a uma messaging_line whatsapp/sales ativa da MESMA org.
CREATE OR REPLACE FUNCTION public.fn_is_sales_eligible_endpoint(
  _organization_id uuid,
  _endpoint_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.communication_endpoints ce
    JOIN public.messaging_line_endpoints mle
      ON mle.endpoint_id = ce.id
     AND mle.is_active = true
     AND mle.organization_id = ce.organization_id
    JOIN public.messaging_lines ml
      ON ml.id = mle.line_id
     AND ml.organization_id = ce.organization_id
     AND ml.channel = 'whatsapp'
     AND ml.inbox_key = 'sales'
     AND ml.is_active = true
    WHERE ce.id = _endpoint_id
      AND ce.organization_id = _organization_id
      AND ce.channel = 'whatsapp'
      AND ce.is_active = true
  );
$$;

-- 1b) Thread Comercial canônica (org + sales + whatsapp + não consolidada)
CREATE OR REPLACE FUNCTION public.fn_is_canonical_sales_thread(
  _organization_id uuid,
  _thread_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.message_threads mt
    WHERE mt.id = _thread_id
      AND mt.organization_id = _organization_id
      AND mt.business_context = 'sales'
      AND mt.channel = 'whatsapp'
      AND mt.merged_into_thread_id IS NULL
  );
$$;

-- 2) Tabelas
CREATE TABLE public.user_reply_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.communication_endpoints(id) ON DELETE CASCADE,
  granted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, endpoint_id)
);

CREATE TABLE public.thread_reply_endpoint_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.communication_endpoints(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, user_id)
);

CREATE INDEX idx_ure_org_user ON public.user_reply_endpoints (organization_id, user_id);
CREATE INDEX idx_trep_thread_user ON public.thread_reply_endpoint_prefs (thread_id, user_id);

-- 3) Grants — somente leitura para authenticated
GRANT SELECT ON public.user_reply_endpoints TO authenticated;
GRANT ALL ON public.user_reply_endpoints TO service_role;
GRANT SELECT ON public.thread_reply_endpoint_prefs TO authenticated;
GRANT ALL ON public.thread_reply_endpoint_prefs TO service_role;

-- 4) RLS — leitura própria ou administrativa, nunca cross-org
ALTER TABLE public.user_reply_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_reply_endpoint_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ure_select_self_or_admin"
  ON public.user_reply_endpoints
  FOR SELECT TO authenticated
  USING (
    organization_id = ANY (public.current_user_org_ids())
    AND (
      user_id = public.current_user_id()
      OR public.can_manage_integrations_in_org(organization_id)
    )
  );

CREATE POLICY "trep_select_self_or_admin"
  ON public.thread_reply_endpoint_prefs
  FOR SELECT TO authenticated
  USING (
    organization_id = ANY (public.current_user_org_ids())
    AND (
      user_id = public.current_user_id()
      OR public.can_manage_integrations_in_org(organization_id)
    )
  );

-- 5) Triggers de integridade (valem inclusive para service_role)
CREATE OR REPLACE FUNCTION public.fn_guard_user_reply_endpoint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = NEW.user_id AND uo.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_CROSS_ORG: user % não pertence à org %',
      NEW.user_id, NEW.organization_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.communication_endpoints ce
    WHERE ce.id = NEW.endpoint_id
      AND ce.organization_id = NEW.organization_id
      AND ce.channel = 'whatsapp'
  ) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_CROSS_ORG: endpoint % inválido para org % (ou não é whatsapp)',
      NEW.endpoint_id, NEW.organization_id;
  END IF;

  -- Hardening 1: endpoint de Atendimento / outra Route nunca entra aqui.
  IF NOT public.fn_is_sales_eligible_endpoint(NEW.organization_id, NEW.endpoint_id) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_NOT_SALES: endpoint % não é elegível ao Comercial da org %',
      NEW.endpoint_id, NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_user_reply_endpoint
  BEFORE INSERT OR UPDATE ON public.user_reply_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_user_reply_endpoint();

CREATE OR REPLACE FUNCTION public.fn_guard_thread_reply_endpoint_pref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Hardening 2: somente thread Comercial canônica de WhatsApp da própria org.
  IF NOT public.fn_is_canonical_sales_thread(NEW.organization_id, NEW.thread_id) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_THREAD_NOT_SALES: thread % não é Comercial canônica de WhatsApp da org %',
      NEW.thread_id, NEW.organization_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = NEW.user_id AND uo.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_CROSS_ORG: user % não pertence à org %',
      NEW.user_id, NEW.organization_id;
  END IF;

  IF NOT public.fn_is_sales_eligible_endpoint(NEW.organization_id, NEW.endpoint_id) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_NOT_SALES: endpoint % não é elegível ao Comercial da org %',
      NEW.endpoint_id, NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_thread_reply_endpoint_pref
  BEFORE INSERT OR UPDATE ON public.thread_reply_endpoint_prefs
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_thread_reply_endpoint_pref();

-- 6) updated_at
CREATE TRIGGER update_user_reply_endpoints_updated_at
  BEFORE UPDATE ON public.user_reply_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_thread_reply_endpoint_prefs_updated_at
  BEFORE UPDATE ON public.thread_reply_endpoint_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) RPCs de mutação (única via de escrita a partir do app)
CREATE OR REPLACE FUNCTION public.grant_user_reply_endpoint(
  _organization_id uuid,
  _user_id uuid,
  _endpoint_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.current_user_id();
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_FORBIDDEN: sem usuário autenticado';
  END IF;
  IF NOT public.can_manage_integrations_in_org(_organization_id) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_FORBIDDEN: sem permissão administrativa na org %', _organization_id;
  END IF;
  IF NOT public.fn_is_sales_eligible_endpoint(_organization_id, _endpoint_id) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_NOT_SALES: endpoint % não é elegível ao Comercial', _endpoint_id;
  END IF;

  INSERT INTO public.user_reply_endpoints (organization_id, user_id, endpoint_id, granted_by_user_id)
  VALUES (_organization_id, _user_id, _endpoint_id, v_actor)
  ON CONFLICT (organization_id, user_id, endpoint_id)
  DO UPDATE SET granted_by_user_id = v_actor, updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_user_reply_endpoint(
  _organization_id uuid,
  _user_id uuid,
  _endpoint_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_integrations_in_org(_organization_id) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_FORBIDDEN: sem permissão administrativa na org %', _organization_id;
  END IF;

  DELETE FROM public.user_reply_endpoints
  WHERE organization_id = _organization_id
    AND user_id = _user_id
    AND endpoint_id = _endpoint_id;

  DELETE FROM public.thread_reply_endpoint_prefs p
  WHERE p.organization_id = _organization_id
    AND p.user_id = _user_id
    AND p.endpoint_id = _endpoint_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_thread_reply_endpoint_pref(
  _thread_id uuid,
  _endpoint_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.current_user_id();
  v_org uuid;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_FORBIDDEN: sem usuário autenticado';
  END IF;

  SELECT mt.organization_id INTO v_org
  FROM public.message_threads mt
  WHERE mt.id = _thread_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_FORBIDDEN: thread % não encontrada', _thread_id;
  END IF;
  IF NOT (v_org = ANY (public.current_user_org_ids())) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_FORBIDDEN: thread fora das organizações do usuário';
  END IF;
  -- Hardening 2 (também na RPC): só thread Comercial canônica.
  IF NOT public.fn_is_canonical_sales_thread(v_org, _thread_id) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_THREAD_NOT_SALES: thread % não é Comercial canônica de WhatsApp', _thread_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_reply_endpoints ure
    WHERE ure.organization_id = v_org
      AND ure.user_id = v_actor
      AND ure.endpoint_id = _endpoint_id
  ) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_FORBIDDEN: usuário não autorizado no endpoint %', _endpoint_id;
  END IF;
  IF NOT public.fn_is_sales_eligible_endpoint(v_org, _endpoint_id) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_NOT_SALES: endpoint % não é elegível ao Comercial', _endpoint_id;
  END IF;

  INSERT INTO public.thread_reply_endpoint_prefs (organization_id, thread_id, user_id, endpoint_id)
  VALUES (v_org, _thread_id, v_actor, _endpoint_id)
  ON CONFLICT (thread_id, user_id)
  DO UPDATE SET endpoint_id = _endpoint_id, updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_thread_reply_endpoint_pref(_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.current_user_id();
  v_org uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_FORBIDDEN: sem usuário autenticado';
  END IF;

  -- Hardening 4: valida org (e contexto sales/whatsapp) ANTES do DELETE.
  SELECT mt.organization_id INTO v_org
  FROM public.message_threads mt
  WHERE mt.id = _thread_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_FORBIDDEN: thread % não encontrada', _thread_id;
  END IF;
  IF NOT (v_org = ANY (public.current_user_org_ids())) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_FORBIDDEN: thread fora das organizações do usuário';
  END IF;
  IF NOT public.fn_is_canonical_sales_thread(v_org, _thread_id) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_THREAD_NOT_SALES: thread % não é Comercial canônica de WhatsApp', _thread_id;
  END IF;

  DELETE FROM public.thread_reply_endpoint_prefs
  WHERE thread_id = _thread_id
    AND user_id = v_actor;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_user_reply_endpoint(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_user_reply_endpoint(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_thread_reply_endpoint_pref(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_thread_reply_endpoint_pref(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_is_sales_eligible_endpoint(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_is_canonical_sales_thread(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.grant_user_reply_endpoint(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_user_reply_endpoint(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_thread_reply_endpoint_pref(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_thread_reply_endpoint_pref(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_sales_eligible_endpoint(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_canonical_sales_thread(uuid, uuid) TO authenticated, service_role;

-- 8) Feature flag: criação atômica, nunca sobrescreve estado inesperado.
DO $flag$
DECLARE
  v_enabled boolean;
  v_orgs uuid[];
BEGIN
  SELECT is_enabled, organization_ids
    INTO v_enabled, v_orgs
    FROM public.feature_flags
   WHERE name = 'sales_manual_reply_endpoint_v1'
   FOR UPDATE;

  IF FOUND THEN
    IF v_enabled IS DISTINCT FROM false
       OR coalesce(array_length(v_orgs, 1), 0) <> 0 THEN
      RAISE EXCEPTION
        'MANUAL_REPLY_FLAG_UNEXPECTED_STATE: flag já existe com enabled=% orgs=%',
        v_enabled, v_orgs;
    END IF;
    -- já existe exatamente no estado seguro; não alterar nada
  ELSE
    INSERT INTO public.feature_flags (
      name, description, is_enabled, organization_ids
    ) VALUES (
      'sales_manual_reply_endpoint_v1',
      'Switch "Responder por" (escolha manual de número no Comercial). OFF por padrão.',
      false,
      '{}'::uuid[]
    );
  END IF;
END
$flag$;

-- 9) Pós-condições obrigatórias
DO $post$
DECLARE
  v_enabled boolean;
  v_orgs uuid[];
BEGIN
  SELECT is_enabled, organization_ids INTO v_enabled, v_orgs
  FROM public.feature_flags
  WHERE name = 'sales_manual_reply_endpoint_v1';

  IF NOT FOUND OR v_enabled IS DISTINCT FROM false
     OR coalesce(array_length(v_orgs, 1), 0) <> 0 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: flag não está OFF/sem orgs (enabled=%, orgs=%)', v_enabled, v_orgs;
  END IF;

  IF (SELECT count(*) FROM public.user_reply_endpoints) <> 0
     OR (SELECT count(*) FROM public.thread_reply_endpoint_prefs) <> 0 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: tabelas deveriam estar vazias';
  END IF;
END
$post$;