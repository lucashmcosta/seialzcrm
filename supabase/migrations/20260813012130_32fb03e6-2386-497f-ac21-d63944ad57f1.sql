CREATE OR REPLACE FUNCTION public.fn_guard_sales_thread_canonical()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
BEGIN
  -- Escopo estrito: apenas Comercial + WhatsApp + contato definido.
  -- Atendimento (customer_service) e business_context NULL ficam FORA do escopo.
  IF NEW.business_context IS DISTINCT FROM 'sales'
     OR NEW.channel IS DISTINCT FROM 'whatsapp'
     OR NEW.contact_id IS NULL
     OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lock transacional do contato: serializa inserts concorrentes do mesmo
  -- org + contact até o fim da transação (fecha a race condition do BEFORE INSERT).
  PERFORM 1
  FROM public.contacts
  WHERE id = NEW.contact_id
    AND organization_id = NEW.organization_id
  FOR UPDATE;

  SELECT t.id
    INTO v_existing
  FROM public.message_threads t
  WHERE t.organization_id = NEW.organization_id
    AND t.contact_id = NEW.contact_id
    AND t.business_context = 'sales'
    AND t.channel = 'whatsapp'
    AND t.merged_into_thread_id IS NULL
    AND t.id IS DISTINCT FROM NEW.id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION
      'SALES_THREAD_DUPLICATE_BLOCKED organization_id=% contact_id=% existing_thread_id=%',
      NEW.organization_id, NEW.contact_id, v_existing;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_guard_sales_thread_canonical ON public.message_threads;

CREATE TRIGGER trg_zz_guard_sales_thread_canonical
BEFORE INSERT ON public.message_threads
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_sales_thread_canonical();