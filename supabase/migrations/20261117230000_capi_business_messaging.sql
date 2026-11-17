-- CAPI no formato de mensagens do WhatsApp (business_messaging), configurável por organização.
--
-- Por padrão toda org continua no formato atual ('legacy'): nada muda para quem não tiver linha em
-- capi_org_settings com event_format = 'business_messaging'.
--
-- No formato business_messaging:
--   * o 'Lead' na criação do contato NÃO é enviado (a Meta não aceita 'Lead' nesse canal);
--   * eventos são disparados por regras em capi_event_rules: entrar numa etapa ('stage_entered')
--     ou ganhar ('won'), cada uma com o nome do evento e o valor;
--   * a Edge Function meta-capi-send-event monta o payload de mensagens e garante
--     um evento por oportunidade e por tipo.

CREATE TABLE IF NOT EXISTS public.capi_org_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_format text NOT NULL DEFAULT 'legacy' CHECK (event_format IN ('legacy', 'business_messaging')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.capi_event_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('stage_entered', 'won')),
  stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  event_name text NOT NULL CHECK (event_name IN (
    'LeadSubmitted', 'QualifiedLead', 'Purchase', 'InitiateCheckout', 'AddToCart', 'ViewContent',
    'OrderCreated', 'OrderShipped', 'OrderDelivered', 'OrderCanceled', 'OrderReturned',
    'CartAbandoned', 'RatingProvided', 'ReviewProvided')),
  value_mode text NOT NULL DEFAULT 'none' CHECK (value_mode IN ('none', 'fixed', 'amount')),
  fixed_value numeric(14,2) CHECK (fixed_value IS NULL OR fixed_value >= 0),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((trigger_type = 'stage_entered') = (stage_id IS NOT NULL)),
  CHECK (value_mode <> 'fixed' OR fixed_value IS NOT NULL)
);

-- Um evento de cada tipo por gatilho (etapa ou ganho).
CREATE UNIQUE INDEX IF NOT EXISTS capi_event_rules_unique
  ON public.capi_event_rules (organization_id, trigger_type, coalesce(stage_id, '00000000-0000-0000-0000-000000000000'::uuid), event_name);

-- A etapa precisa ser da mesma org da regra.
CREATE OR REPLACE FUNCTION public.fn_guard_capi_event_rule_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pipeline_stages s
    WHERE s.id = NEW.stage_id AND s.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'capi_rule_stage_other_org' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_capi_event_rule_stage ON public.capi_event_rules;
CREATE TRIGGER trg_guard_capi_event_rule_stage
  BEFORE INSERT OR UPDATE ON public.capi_event_rules
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_capi_event_rule_stage();

ALTER TABLE public.capi_org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capi_event_rules ENABLE ROW LEVEL SECURITY;

-- Leitura para membros da org; escrita só pelo backend (service_role) por enquanto.
DROP POLICY IF EXISTS capi_org_settings_select ON public.capi_org_settings;
CREATE POLICY capi_org_settings_select ON public.capi_org_settings
  FOR SELECT TO authenticated USING (organization_id = ANY(public.current_user_org_ids()));
DROP POLICY IF EXISTS capi_event_rules_select ON public.capi_event_rules;
CREATE POLICY capi_event_rules_select ON public.capi_event_rules
  FOR SELECT TO authenticated USING (organization_id = ANY(public.current_user_org_ids()));

CREATE OR REPLACE FUNCTION public.fn_capi_event_format(p_organization_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT event_format FROM public.capi_org_settings WHERE organization_id = p_organization_id),
    'legacy');
$$;

-- Lead na criação do contato: só no formato atual.
CREATE OR REPLACE FUNCTION public.fn_capi_trigger_lead_on_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
BEGIN
  IF public.fn_capi_event_format(NEW.organization_id) = 'business_messaging' THEN
    RETURN NEW;
  END IF;
  PERFORM public.fn_capi_dispatch_event(NEW.organization_id, 'Lead', NEW.id, NULL);
  RETURN NEW;
END;
$function$;

-- Ganho: formato atual manda Purchase como sempre; formato mensagens manda o que as regras 'won' dizem.
CREATE OR REPLACE FUNCTION public.fn_capi_trigger_purchase_on_opp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE
  r record;
BEGIN
  IF public.fn_capi_event_format(NEW.organization_id) <> 'business_messaging' THEN
    PERFORM public.fn_capi_dispatch_event(NEW.organization_id, 'Purchase', NEW.contact_id, NEW.id);
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT DISTINCT event_name FROM public.capi_event_rules
    WHERE organization_id = NEW.organization_id AND trigger_type = 'won' AND is_active
  LOOP
    PERFORM public.fn_capi_dispatch_event(NEW.organization_id, r.event_name, NEW.contact_id, NEW.id);
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Entrou numa etapa com regra (só no formato mensagens).
CREATE OR REPLACE FUNCTION public.fn_capi_trigger_stage_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
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
  -- Nunca derruba a mudança de etapa por causa da CAPI.
  RAISE WARNING 'fn_capi_trigger_stage_rules error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_capi_stage_rules_update ON public.opportunities;
CREATE TRIGGER trg_capi_stage_rules_update
  AFTER UPDATE OF pipeline_stage_id ON public.opportunities
  FOR EACH ROW WHEN (OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id)
  EXECUTE FUNCTION public.fn_capi_trigger_stage_rules();

DROP TRIGGER IF EXISTS trg_capi_stage_rules_insert ON public.opportunities;
CREATE TRIGGER trg_capi_stage_rules_insert
  AFTER INSERT ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.fn_capi_trigger_stage_rules();

REVOKE ALL ON FUNCTION public.fn_capi_event_format(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_capi_trigger_stage_rules() FROM PUBLIC, anon, authenticated;

-- ctwa_clid da PRIMEIRA mensagem do contato que veio de anúncio (o clique que originou a conversa).
-- Leva o mesmo código em todos os eventos daquela oportunidade.
CREATE OR REPLACE FUNCTION public.fn_capi_first_ctwa_clid(p_organization_id uuid, p_contact_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.metadata->'meta_cloud'->'referral'->>'ctwa_clid'
  FROM public.message_threads th
  JOIN public.messages m ON m.thread_id = th.id
  WHERE th.organization_id = p_organization_id
    AND th.contact_id = p_contact_id
    AND m.direction = 'inbound'
    AND nullif(m.metadata->'meta_cloud'->'referral'->>'ctwa_clid', '') IS NOT NULL
  ORDER BY m.created_at ASC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.fn_capi_first_ctwa_clid(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_capi_first_ctwa_clid(uuid, uuid) TO service_role;
