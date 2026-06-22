
-- 1) Catálogo global da integração Nammux
INSERT INTO public.admin_integrations (slug, name, description, status, category, sort_order, config_schema)
VALUES (
  'nammux',
  'Nammux',
  'Sincroniza oportunidades ganhas (opportunity.won) com o sistema jurídico Nammux via webhook HMAC.',
  'beta',
  'other',
  100,
  jsonb_build_object(
    'fields', jsonb_build_array(
      jsonb_build_object('key','webhook_url','label','Webhook URL','type','string','required',true),
      jsonb_build_object('key','webhook_secret','label','Webhook Secret','type','password','required',true,'secret',true),
      jsonb_build_object('key','enabled','label','Ativar integração','type','boolean','default',true),
      jsonb_build_object('key','send_opportunity_won','label','Enviar opportunity.won','type','boolean','default',true)
    )
  )
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      config_schema = EXCLUDED.config_schema,
      updated_at = now();

-- 2) Sync de subscription opportunity.won por organização
CREATE OR REPLACE FUNCTION public.fn_sync_nammux_subscription(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_send_won boolean;
  v_cfg jsonb;
BEGIN
  SELECT oi.is_enabled,
         COALESCE((oi.config_values->>'enabled')::boolean, true),
         COALESCE((oi.config_values->>'send_opportunity_won')::boolean, true),
         oi.config_values
    INTO v_enabled, v_enabled, v_send_won, v_cfg
  FROM public.organization_integrations oi
  JOIN public.admin_integrations ai ON ai.id = oi.integration_id
  WHERE oi.organization_id = p_org_id AND ai.slug = 'nammux'
  LIMIT 1;

  -- Reset bloco: re-le com semantica correta
  SELECT oi.is_enabled,
         COALESCE((oi.config_values->>'send_opportunity_won')::boolean, true),
         oi.config_values
    INTO v_enabled, v_send_won, v_cfg
  FROM public.organization_integrations oi
  JOIN public.admin_integrations ai ON ai.id = oi.integration_id
  WHERE oi.organization_id = p_org_id AND ai.slug = 'nammux'
  LIMIT 1;

  IF v_enabled IS TRUE
     AND v_send_won IS TRUE
     AND COALESCE((v_cfg->>'enabled')::boolean, true) IS TRUE
     AND COALESCE(v_cfg->>'webhook_url','') <> ''
     AND COALESCE(v_cfg->>'webhook_secret','') <> '' THEN
    INSERT INTO public.integration_subscriptions
      (organization_id, integration_slug, event_type, target_action, is_active, config)
    VALUES
      (p_org_id, 'nammux', 'opportunity.won', 'send_opportunity_won', true, '{}'::jsonb)
    ON CONFLICT DO NOTHING;

    UPDATE public.integration_subscriptions
       SET is_active = true, paused_until = NULL
     WHERE organization_id = p_org_id
       AND integration_slug = 'nammux'
       AND event_type = 'opportunity.won'
       AND target_action = 'send_opportunity_won';
  ELSE
    UPDATE public.integration_subscriptions
       SET is_active = false
     WHERE organization_id = p_org_id
       AND integration_slug = 'nammux'
       AND event_type = 'opportunity.won'
       AND target_action = 'send_opportunity_won';
  END IF;
END;
$$;

-- Unique parcial pra ON CONFLICT funcionar (uma subscription por org/slug/event/action)
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_subscriptions_org_slug_event_action
  ON public.integration_subscriptions(organization_id, integration_slug, event_type, target_action);

-- 3) Trigger em organization_integrations
CREATE OR REPLACE FUNCTION public.fn_trg_sync_nammux_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  SELECT slug INTO v_slug FROM public.admin_integrations WHERE id = NEW.integration_id;
  IF v_slug = 'nammux' AND NEW.organization_id IS NOT NULL THEN
    PERFORM public.fn_sync_nammux_subscription(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_nammux_subscription ON public.organization_integrations;
CREATE TRIGGER trg_sync_nammux_subscription
AFTER INSERT OR UPDATE OF is_enabled, config_values, integration_id
ON public.organization_integrations
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_sync_nammux_subscription();
