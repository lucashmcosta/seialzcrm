
-- PR 1.2: Trigger de validação de endpoint da thread
-- Bloqueia INSERT/UPDATE de message_threads.primary_endpoint_id apontando para
-- endpoint de outra organização (cross-org leakage).

CREATE OR REPLACE FUNCTION public.fn_validate_thread_endpoint_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ep_org uuid;
BEGIN
  IF NEW.primary_endpoint_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO ep_org
    FROM public.communication_endpoints
   WHERE id = NEW.primary_endpoint_id;

  IF ep_org IS NULL THEN
    RAISE EXCEPTION 'endpoint_not_found: primary_endpoint_id % não existe em communication_endpoints', NEW.primary_endpoint_id
      USING ERRCODE = '23514';
  END IF;

  IF ep_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'endpoint_org_mismatch: endpoint % pertence à org %, thread pertence à org %',
      NEW.primary_endpoint_id, ep_org, NEW.organization_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_thread_endpoint_org ON public.message_threads;

CREATE TRIGGER trg_validate_thread_endpoint_org
  BEFORE INSERT OR UPDATE OF primary_endpoint_id, organization_id
  ON public.message_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_thread_endpoint_org();

COMMENT ON FUNCTION public.fn_validate_thread_endpoint_org() IS
  'PR1.2 (Fase 0 Mensagens): impede que primary_endpoint_id aponte para endpoint de outra organização.';


-- PR 1.3: Índice composto para listagem de threads
-- Não usa CONCURRENTLY porque migrations rodam em transação (CREATE INDEX CONCURRENTLY
-- não pode rodar em bloco transacional). Fallback documentado no plano:
-- tabela tem ~12.7k linhas / 53 MB, bloqueio esperado < 2s.

CREATE INDEX IF NOT EXISTS idx_threads_org_status_lastmsg
  ON public.message_threads (organization_id, status, last_message_at DESC NULLS LAST)
  INCLUDE (contact_id, primary_endpoint_id, assigned_user_id);

COMMENT ON INDEX public.idx_threads_org_status_lastmsg IS
  'PR1.3 (Fase 0 Mensagens): elimina Sort na listagem principal de threads.';
