-- Histórico de perdas: cada vez que a oportunidade vira Perdida nasce uma linha; nada é sobrescrito.
-- Reabrir só fecha a linha (reopened_*); perder de novo cria outra. Correção de motivo fica em
-- opportunity_loss_corrections com o valor anterior.
-- Já traz os campos que a integração (automação/agente/API) usa: actor_type, automation_ref e os códigos copiados.
-- Rollback: supabase/rollback/20261110120200_opportunity_losses_DOWN.sql


CREATE TABLE public.opportunity_losses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  reason_id uuid,
  detail_id uuid,
  -- cópia do código no momento da perda: relatórios agrupam por aqui
  reason_code text,
  detail_code text,
  description text CHECK (description IS NULL OR length(description) <= 2000),
  -- etapa em que a oportunidade estava antes de ir para Perdida (destino da reabertura)
  stage_id_at_loss uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  close_date date,
  lost_at timestamptz NOT NULL DEFAULT now(),
  -- user = pessoa; automation/agent/api = integração (automation_ref diz qual); system = caminho interno sem autor
  actor_type text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'automation', 'agent', 'api', 'system')),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  automation_ref text CHECK (automation_ref IS NULL OR length(automation_ref) <= 200),
  source text NOT NULL DEFAULT 'unknown',
  reopened_at timestamptz,
  reopened_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reopened_to_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (reason_id, organization_id) REFERENCES public.opportunity_loss_reasons (id, organization_id),
  FOREIGN KEY (detail_id, organization_id) REFERENCES public.opportunity_loss_reason_details (id, organization_id),
  -- o detalhe precisa ser do motivo gravado
  FOREIGN KEY (detail_id, reason_id) REFERENCES public.opportunity_loss_reason_details (id, reason_id),
  CHECK (detail_id IS NULL OR reason_id IS NOT NULL),
  CHECK ((reason_id IS NULL) = (reason_code IS NULL) AND (detail_id IS NULL) = (detail_code IS NULL))
);
-- No máximo uma perda em aberto por oportunidade.
CREATE UNIQUE INDEX opportunity_losses_open_key
  ON public.opportunity_losses (opportunity_id) WHERE reopened_at IS NULL;
CREATE INDEX opportunity_losses_opportunity_idx ON public.opportunity_losses (opportunity_id, lost_at DESC);
CREATE INDEX opportunity_losses_org_lost_at_idx ON public.opportunity_losses (organization_id, lost_at DESC);
CREATE INDEX opportunity_losses_reason_idx ON public.opportunity_losses (reason_id) WHERE reason_id IS NOT NULL;
CREATE INDEX opportunity_losses_detail_idx ON public.opportunity_losses (detail_id) WHERE detail_id IS NOT NULL;

CREATE TABLE public.opportunity_loss_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  loss_id uuid NOT NULL REFERENCES public.opportunity_losses(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  old_reason_id uuid,
  old_detail_id uuid,
  old_reason_code text,
  old_detail_code text,
  old_description text,
  new_reason_id uuid,
  new_detail_id uuid,
  new_reason_code text,
  new_detail_code text,
  new_description text,
  corrected_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  corrected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opportunity_loss_corrections_loss_idx ON public.opportunity_loss_corrections (loss_id, corrected_at DESC);

-- "Já usado" = referenciado por alguma perda (inclusive como valor anterior de uma correção).
CREATE OR REPLACE FUNCTION public.loss_reason_is_used(_reason_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.opportunity_losses WHERE reason_id = _reason_id)
      OR EXISTS (SELECT 1 FROM public.opportunity_loss_corrections WHERE old_reason_id = _reason_id OR new_reason_id = _reason_id);
$$;
CREATE OR REPLACE FUNCTION public.loss_detail_is_used(_detail_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.opportunity_losses WHERE detail_id = _detail_id)
      OR EXISTS (SELECT 1 FROM public.opportunity_loss_corrections WHERE old_detail_id = _detail_id OR new_detail_id = _detail_id);
$$;
REVOKE ALL ON FUNCTION public.loss_reason_is_used(uuid), public.loss_detail_is_used(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loss_reason_is_used(uuid), public.loss_detail_is_used(uuid) TO service_role;

-- Código não muda depois de usado; o que foi usado não é apagado (só inativado).
CREATE OR REPLACE FUNCTION public.fn_guard_loss_reason_usage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF upper(NEW.code) IS DISTINCT FROM upper(OLD.code) AND public.loss_reason_is_used(OLD.id) THEN
      RAISE EXCEPTION 'loss_code_in_use' USING ERRCODE = '23514',
        HINT = 'O código já foi usado em alguma oportunidade e não pode mudar.';
    END IF;
    RETURN NEW;
  END IF;
  -- exclusão em cascata da org inteira: as perdas vão junto
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.organization_id) THEN RETURN OLD; END IF;
  IF public.loss_reason_is_used(OLD.id)
     OR EXISTS (SELECT 1 FROM public.opportunity_loss_reason_details d
                WHERE d.reason_id = OLD.id AND public.loss_detail_is_used(d.id)) THEN
    RAISE EXCEPTION 'loss_reason_in_use' USING ERRCODE = '23503',
      HINT = 'Motivo já usado não pode ser apagado. Inative-o.';
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.fn_guard_loss_detail_usage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF upper(NEW.code) IS DISTINCT FROM upper(OLD.code) AND public.loss_detail_is_used(OLD.id) THEN
      RAISE EXCEPTION 'loss_code_in_use' USING ERRCODE = '23514',
        HINT = 'O código já foi usado em alguma oportunidade e não pode mudar.';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.organization_id) THEN RETURN OLD; END IF;
  IF public.loss_detail_is_used(OLD.id) THEN
    RAISE EXCEPTION 'loss_detail_in_use' USING ERRCODE = '23503',
      HINT = 'Detalhe já usado não pode ser apagado. Inative-o.';
  END IF;
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_guard_loss_reason_usage(), public.fn_guard_loss_detail_usage() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_loss_reason_usage
BEFORE UPDATE OF code OR DELETE ON public.opportunity_loss_reasons
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_loss_reason_usage();
CREATE TRIGGER trg_guard_loss_detail_usage
BEFORE UPDATE OF code OR DELETE ON public.opportunity_loss_reason_details
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_loss_detail_usage();

-- Saiu de Perdida por qualquer caminho (botão Reabrir, Kanban, lote, integração): fecha a perda em aberto.
CREATE OR REPLACE FUNCTION public.fn_close_open_loss_on_reopen_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.opportunity_losses
  SET reopened_at = now(),
      reopened_by = public.current_user_id(),
      reopened_to_stage_id = NEW.pipeline_stage_id
  WHERE opportunity_id = NEW.id AND reopened_at IS NULL;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_close_open_loss_on_reopen_v1() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_close_open_loss_on_reopen_v1
AFTER UPDATE ON public.opportunities
FOR EACH ROW
WHEN (OLD.status::text = 'lost' AND NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.fn_close_open_loss_on_reopen_v1();

-- Escrita só pelas RPCs (SECURITY DEFINER) e service_role; o frontend só lê.
-- Leitura acompanha a visibilidade da oportunidade (a subconsulta passa pela RLS de opportunities).
ALTER TABLE public.opportunity_losses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_loss_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY opportunity_losses_select ON public.opportunity_losses
  FOR SELECT TO authenticated
  USING (organization_id = ANY(public.current_user_org_ids())
         AND EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = opportunity_id));
CREATE POLICY opportunity_loss_corrections_select ON public.opportunity_loss_corrections
  FOR SELECT TO authenticated
  USING (organization_id = ANY(public.current_user_org_ids())
         AND EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = opportunity_id));

REVOKE ALL ON public.opportunity_losses, public.opportunity_loss_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.opportunity_losses, public.opportunity_loss_corrections TO authenticated;
GRANT ALL ON public.opportunity_losses, public.opportunity_loss_corrections TO service_role;

