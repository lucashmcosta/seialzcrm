-- Volta fn_capi_trigger_stage_rules ao corpo anterior (sem a opção app.capi_skip).
CREATE OR REPLACE FUNCTION public.fn_capi_trigger_stage_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  r record;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.pipeline_stage_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.fn_capi_event_format(NEW.organization_id) <> 'business_messaging' THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT DISTINCT event_name FROM public.capi_event_rules
    WHERE organization_id = NEW.organization_id AND trigger_type = 'stage_entered'
      AND stage_id = NEW.pipeline_stage_id AND is_active
  LOOP
    PERFORM public.fn_capi_dispatch_event(NEW.organization_id, r.event_name, NEW.contact_id, NEW.id);
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_capi_trigger_stage_rules error: %', SQLERRM;
  RETURN NEW;
END;
$function$;
