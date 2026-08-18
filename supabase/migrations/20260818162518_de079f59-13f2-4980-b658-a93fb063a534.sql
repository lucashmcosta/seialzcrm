CREATE OR REPLACE FUNCTION public.fn_message_threads_autofill_business_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_purpose text;
BEGIN
  IF NEW.business_context IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.primary_endpoint_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.primary_endpoint_id = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'::uuid THEN
    IF coalesce(NEW.created_at, now()) < '2026-06-16 22:29:40+00'::timestamptz THEN
      NEW.business_context := 'sales';
    ELSE
      NEW.business_context := 'customer_service';
    END IF;
    RETURN NEW;
  END IF;

  SELECT purpose INTO v_purpose
    FROM public.communication_endpoints
   WHERE id = NEW.primary_endpoint_id;

  -- Fase 1 (contrato de números pessoais): vendor_personal opera DENTRO da
  -- conversa Comercial canônica. A restrição de quem pode responder é feita
  -- por communication_endpoints.assigned_user_id (Fase 2), nunca por thread.
  IF lower(coalesce(v_purpose,'')) IN ('sales','commercial','vendor_personal') THEN
    NEW.business_context := 'sales';
  ELSIF lower(coalesce(v_purpose,'')) IN ('customer_service','support') THEN
    NEW.business_context := 'customer_service';
  ELSIF v_purpose IS NOT NULL THEN
    NEW.business_context := 'other';
  END IF;
  RETURN NEW;
END $function$;