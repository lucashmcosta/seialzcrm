CREATE OR REPLACE FUNCTION public.fn_opportunity_won_promote_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Promove contato a 'customer' quando uma opportunity entra/passa a status='won'.
  -- Nunca rebaixa. Não toca em endpoint, threads, messages ou composer.
  IF NEW.status = 'won'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'won')
     AND NEW.contact_id IS NOT NULL
     AND NEW.deleted_at IS NULL
  THEN
    UPDATE public.contacts c
       SET lifecycle_stage = 'customer',
           updated_at = now()
     WHERE c.id = NEW.contact_id
       AND c.organization_id = NEW.organization_id
       AND c.deleted_at IS NULL
       AND c.lifecycle_stage IS DISTINCT FROM 'customer';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_won_promote_contact ON public.opportunities;

-- AFTER INSERT OR UPDATE (sem "OF status") porque sync_opportunity_status_from_stage
-- altera NEW.status via BEFORE trigger sem que 'status' apareça no SET do UPDATE
-- original (ex.: usuário move card → SET pipeline_stage_id=...). A própria função
-- guarda com OLD.status IS DISTINCT FROM 'won' para idempotência.
CREATE TRIGGER trg_opportunity_won_promote_contact
AFTER INSERT OR UPDATE ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.fn_opportunity_won_promote_contact();