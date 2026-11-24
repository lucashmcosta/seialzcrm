-- Arrumação em lote do funil (Fase 5 do plano docs/plans/2026-11-24-funil-pela-classificacao-do-agente.md):
-- mover dezenas de oportunidades de uma vez não pode disparar eventos de etapa para a Meta, senão
-- o sinal das campanhas fica distorcido. Quem faz o lote liga, NA PRÓPRIA TRANSAÇÃO,
--   select set_config('app.capi_skip', 'on', true);
-- e esta função não dispara nada enquanto a opção estiver ligada. Fora disso, nada muda.
-- Rollback: supabase/rollback/20261126100000_capi_stage_rules_skip_for_backfill_DOWN.sql
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
  IF coalesce(current_setting('app.capi_skip', true), '') = 'on' THEN
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
