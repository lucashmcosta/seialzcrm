-- =====================================================================
-- FASE 1 — Infraestrutura Comercial V2 (Routes). Flag conv_route_resolver_v2 OFF.
-- Atendimento intacto. Sem alteração em message_threads / webhooks / UX.
-- =====================================================================

-- 1) Colunas novas (nullable, sem default de classificação)
ALTER TABLE public.messaging_lines
  ADD COLUMN IF NOT EXISTS inbox_key text,
  ADD COLUMN IF NOT EXISTS route_slug text,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2) Backfill explícito
UPDATE public.messaging_lines SET inbox_key = 'sales'            WHERE key = 'commercial'       AND inbox_key IS NULL;
UPDATE public.messaging_lines SET inbox_key = 'sales'            WHERE key = 'evolution_pilot'  AND inbox_key IS NULL;
UPDATE public.messaging_lines SET inbox_key = 'customer_service' WHERE key = 'customer_service' AND inbox_key IS NULL;
UPDATE public.messaging_lines SET route_slug = key WHERE route_slug IS NULL;

-- 3) Validação bloqueante do backfill
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM public.messaging_lines
   WHERE inbox_key IS NULL OR route_slug IS NULL
      OR inbox_key NOT IN ('sales','customer_service')
      OR key NOT IN ('commercial','customer_service','evolution_pilot');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BACKFILL_INCOMPLETO: % linha(s) sem classificacao confiavel', v_bad;
  END IF;
END $$;

-- 4) NOT NULL + CHECK
ALTER TABLE public.messaging_lines
  ALTER COLUMN inbox_key SET NOT NULL,
  ALTER COLUMN route_slug SET NOT NULL;
ALTER TABLE public.messaging_lines DROP CONSTRAINT IF EXISTS messaging_lines_inbox_key_check;
ALTER TABLE public.messaging_lines
  ADD CONSTRAINT messaging_lines_inbox_key_check CHECK (inbox_key IN ('sales','customer_service'));

-- 5) key legada: nullable, sem CHECK restritivo
ALTER TABLE public.messaging_lines DROP CONSTRAINT IF EXISTS messaging_lines_key_check;
ALTER TABLE public.messaging_lines ALTER COLUMN key DROP NOT NULL;

-- 6) N Routes por org+canal
ALTER TABLE public.messaging_lines
  DROP CONSTRAINT IF EXISTS messaging_lines_organization_id_key_channel_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_messaging_lines_legacy_key
  ON public.messaging_lines (organization_id, key, channel) WHERE key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_messaging_lines_route_slug
  ON public.messaging_lines (organization_id, channel, route_slug);

-- 7) messaging_line_endpoints (SOMENTE Comercial V2)
CREATE TABLE IF NOT EXISTS public.messaging_line_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES public.messaging_lines(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.communication_endpoints(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mle_line_endpoint UNIQUE (line_id, endpoint_id)
);

-- OPÇÃO A: authenticated = SOMENTE SELECT. Alteração de vínculo apenas por
-- operação server-side controlada (rotate_messaging_line_endpoint / service_role).
-- As policies admin de DML abaixo não são porta utilizável (sem GRANT de DML,
-- PostgREST recusa antes de avaliar RLS); ficam como defesa em profundidade.
REVOKE INSERT, UPDATE, DELETE ON public.messaging_line_endpoints FROM authenticated;
GRANT SELECT ON public.messaging_line_endpoints TO authenticated;
GRANT ALL ON public.messaging_line_endpoints TO service_role;

ALTER TABLE public.messaging_line_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mle_select_org_members ON public.messaging_line_endpoints;
CREATE POLICY mle_select_org_members ON public.messaging_line_endpoints
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));

DROP POLICY IF EXISTS mle_admin_insert ON public.messaging_line_endpoints;
CREATE POLICY mle_admin_insert ON public.messaging_line_endpoints
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = ANY (public.current_user_org_ids())
              AND public.is_org_admin(organization_id));

DROP POLICY IF EXISTS mle_admin_update ON public.messaging_line_endpoints;
CREATE POLICY mle_admin_update ON public.messaging_line_endpoints
  FOR UPDATE TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids())
         AND public.is_org_admin(organization_id))
  WITH CHECK (organization_id = ANY (public.current_user_org_ids())
              AND public.is_org_admin(organization_id));

DROP POLICY IF EXISTS mle_admin_delete ON public.messaging_line_endpoints;
CREATE POLICY mle_admin_delete ON public.messaging_line_endpoints
  FOR DELETE TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids())
         AND public.is_org_admin(organization_id));

DROP POLICY IF EXISTS mle_service_role_all ON public.messaging_line_endpoints;
CREATE POLICY mle_service_role_all ON public.messaging_line_endpoints
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mle_line ON public.messaging_line_endpoints (line_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_mle_org  ON public.messaging_line_endpoints (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mle_active_endpoint
  ON public.messaging_line_endpoints (endpoint_id) WHERE is_active;

CREATE OR REPLACE FUNCTION public.fn_touch_messaging_line_endpoints()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mle_updated_at ON public.messaging_line_endpoints;
CREATE TRIGGER trg_mle_updated_at BEFORE UPDATE ON public.messaging_line_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_messaging_line_endpoints();

-- 7b) Integridade do mapping no banco (vale inclusive para service_role)
CREATE OR REPLACE FUNCTION public.fn_validate_messaging_line_endpoint()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_line public.messaging_lines;
  v_ep   public.communication_endpoints;
BEGIN
  SELECT * INTO v_line FROM public.messaging_lines WHERE id = NEW.line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MLE_LINE_NOT_FOUND'; END IF;

  SELECT * INTO v_ep FROM public.communication_endpoints WHERE id = NEW.endpoint_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MLE_ENDPOINT_NOT_FOUND'; END IF;

  IF v_line.inbox_key IS DISTINCT FROM 'sales' THEN
    RAISE EXCEPTION 'MLE_NOT_SALES_ROUTE';
  END IF;
  IF v_line.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'MLE_LINE_ORG_MISMATCH';
  END IF;
  IF v_ep.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'MLE_ENDPOINT_ORG_MISMATCH';
  END IF;
  IF v_ep.channel <> v_line.channel THEN
    RAISE EXCEPTION 'MLE_CHANNEL_MISMATCH';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_messaging_line_endpoint ON public.messaging_line_endpoints;
CREATE TRIGGER trg_validate_messaging_line_endpoint
  BEFORE INSERT OR UPDATE ON public.messaging_line_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_messaging_line_endpoint();

-- 8) Piloto Evolution: registro preservado, desativado
UPDATE public.messaging_lines
   SET is_active = false, updated_at = now()
 WHERE key = 'evolution_pilot';

-- 9) Seed determinístico: cada Route sales ativa vincula SOMENTE seu active_endpoint_id
INSERT INTO public.messaging_line_endpoints (organization_id, line_id, endpoint_id)
SELECT ml.organization_id, ml.id, ml.active_endpoint_id
  FROM public.messaging_lines ml
  JOIN public.communication_endpoints ce ON ce.id = ml.active_endpoint_id
 WHERE ml.inbox_key = 'sales'
   AND ml.is_active
   AND ml.active_endpoint_id IS NOT NULL
   AND ce.organization_id = ml.organization_id
   AND ce.channel = ml.channel
ON CONFLICT (line_id, endpoint_id) DO NOTHING;

-- 10) Validação bloqueante dos invariantes iniciais
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.messaging_lines ml
   WHERE ml.inbox_key = 'sales' AND ml.is_active AND ml.active_endpoint_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.messaging_line_endpoints mle
                      WHERE mle.line_id = ml.id AND mle.endpoint_id = ml.active_endpoint_id AND mle.is_active);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVARIANTE_VIOLADO: % Route(s) sales ativas sem vinculo do active_endpoint_id', v_bad;
  END IF;

  SELECT count(*) INTO v_bad FROM (
    SELECT endpoint_id FROM public.messaging_line_endpoints
     WHERE is_active GROUP BY endpoint_id HAVING count(DISTINCT line_id) > 1) t;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVARIANTE_VIOLADO: % endpoint(s) ativos em mais de uma Route', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.messaging_line_endpoints m JOIN public.messaging_lines l ON l.id = m.line_id
   WHERE l.inbox_key = 'customer_service';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVARIANTE_VIOLADO: % mapping(s) de Atendimento criados', v_bad;
  END IF;
END $$;

-- 11) Invariante como trigger — SOMENTE inbox_key='sales' e Route ativa
CREATE OR REPLACE FUNCTION public.fn_validate_messaging_line_active_endpoint()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.inbox_key IS DISTINCT FROM 'sales' OR NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.active_endpoint_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.messaging_line_endpoints mle
     WHERE mle.line_id = NEW.id AND mle.endpoint_id = NEW.active_endpoint_id AND mle.is_active
  ) THEN
    RAISE EXCEPTION 'ROUTE_ACTIVE_ENDPOINT_NOT_LINKED';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_messaging_line_active_endpoint ON public.messaging_lines;
CREATE TRIGGER trg_validate_messaging_line_active_endpoint
  BEFORE INSERT OR UPDATE ON public.messaging_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_messaging_line_active_endpoint();

-- 12) Rotação atômica (única porta para trocar o número ativo da Route) — ADMIN ONLY
CREATE OR REPLACE FUNCTION public.rotate_messaging_line_endpoint(
  p_line_id uuid, p_endpoint_id uuid, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_line  public.messaging_lines;
  v_ep    public.communication_endpoints;
  v_actor uuid := public.current_user_id();
  v_from  uuid;
BEGIN
  SELECT * INTO v_line FROM public.messaging_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROTATION_LINE_NOT_FOUND'; END IF;

  IF v_line.inbox_key IS DISTINCT FROM 'sales' THEN
    RAISE EXCEPTION 'ROTATION_NOT_SALES_ROUTE';
  END IF;

  IF v_actor IS NULL
     OR NOT (v_line.organization_id = ANY (public.current_user_org_ids()))
     OR NOT public.is_org_admin(v_line.organization_id) THEN
    RAISE EXCEPTION 'ROTATION_FORBIDDEN';
  END IF;

  SELECT * INTO v_ep FROM public.communication_endpoints WHERE id = p_endpoint_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROTATION_ENDPOINT_NOT_FOUND'; END IF;
  IF v_ep.organization_id <> v_line.organization_id THEN RAISE EXCEPTION 'ROTATION_ENDPOINT_FOREIGN_ORG'; END IF;
  IF v_ep.channel <> v_line.channel THEN RAISE EXCEPTION 'ROTATION_CHANNEL_MISMATCH'; END IF;
  IF v_ep.is_active IS NOT TRUE THEN RAISE EXCEPTION 'ROTATION_ENDPOINT_INACTIVE'; END IF;

  IF EXISTS (SELECT 1 FROM public.messaging_line_endpoints
              WHERE endpoint_id = p_endpoint_id AND is_active AND line_id <> p_line_id) THEN
    RAISE EXCEPTION 'ROTATION_ENDPOINT_IN_USE';
  END IF;

  -- reutiliza a MESMA row do par (line_id, endpoint_id) — unicidade total garante 1 row
  IF EXISTS (SELECT 1 FROM public.messaging_line_endpoints
              WHERE line_id = p_line_id AND endpoint_id = p_endpoint_id) THEN
    UPDATE public.messaging_line_endpoints
       SET is_active = true, unlinked_at = NULL, linked_at = COALESCE(linked_at, now()), updated_at = now()
     WHERE line_id = p_line_id AND endpoint_id = p_endpoint_id;
  ELSE
    INSERT INTO public.messaging_line_endpoints (organization_id, line_id, endpoint_id)
    VALUES (v_line.organization_id, p_line_id, p_endpoint_id);
  END IF;

  v_from := v_line.active_endpoint_id;
  UPDATE public.messaging_lines
     SET active_endpoint_id = p_endpoint_id, updated_at = now()
   WHERE id = p_line_id;

  INSERT INTO public.messaging_line_rotations
    (organization_id, line_id, from_endpoint_id, to_endpoint_id, reason, rotated_by_user_id)
  VALUES (v_line.organization_id, p_line_id, v_from, p_endpoint_id, p_reason, v_actor);

  RETURN jsonb_build_object('line_id', p_line_id, 'from_endpoint_id', v_from,
                            'to_endpoint_id', p_endpoint_id, 'rotated_by_user_id', v_actor);
END $$;

REVOKE ALL ON FUNCTION public.rotate_messaging_line_endpoint(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_messaging_line_endpoint(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_messaging_line_endpoint(uuid, uuid, text) TO service_role;

-- 13) RLS de messaging_lines: leitura a membros, escrita a admin;
--     active_endpoint_id só via RPC; inbox_key imutável por UPDATE direto
DROP POLICY IF EXISTS "org members manage messaging_lines" ON public.messaging_lines;

DROP POLICY IF EXISTS ml_select_org_members ON public.messaging_lines;
CREATE POLICY ml_select_org_members ON public.messaging_lines
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));

DROP POLICY IF EXISTS ml_admin_insert ON public.messaging_lines;
CREATE POLICY ml_admin_insert ON public.messaging_lines
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = ANY (public.current_user_org_ids())
              AND public.is_org_admin(organization_id));

DROP POLICY IF EXISTS ml_admin_update ON public.messaging_lines;
CREATE POLICY ml_admin_update ON public.messaging_lines
  FOR UPDATE TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids())
         AND public.is_org_admin(organization_id))
  WITH CHECK (organization_id = ANY (public.current_user_org_ids())
              AND public.is_org_admin(organization_id));

DROP POLICY IF EXISTS ml_admin_delete ON public.messaging_lines;
CREATE POLICY ml_admin_delete ON public.messaging_lines
  FOR DELETE TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids())
         AND public.is_org_admin(organization_id));

DROP POLICY IF EXISTS ml_service_role_all ON public.messaging_lines;
CREATE POLICY ml_service_role_all ON public.messaging_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE UPDATE ON public.messaging_lines FROM authenticated;
GRANT UPDATE (name, owner_user_id, is_active, route_slug, updated_at)
  ON public.messaging_lines TO authenticated;