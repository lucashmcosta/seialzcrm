CREATE UNIQUE INDEX IF NOT EXISTS uniq_messaging_lines_org_channel_key
  ON public.messaging_lines (organization_id, channel, key);

CREATE OR REPLACE FUNCTION public.fn_seed_default_messaging_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    INSERT INTO public.messaging_lines (organization_id, name, key, inbox_key, channel, route_slug, is_active)
    VALUES
      (NEW.id, 'Comercial', 'commercial', 'sales', 'whatsapp', 'commercial', true),
      (NEW.id, 'Atendimento', 'customer_service', 'customer_service', 'whatsapp', 'customer_service', true)
    ON CONFLICT (organization_id, channel, key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_seed_default_messaging_lines failed for org %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_default_messaging_lines ON public.organizations;
CREATE TRIGGER trg_seed_default_messaging_lines
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_seed_default_messaging_lines();