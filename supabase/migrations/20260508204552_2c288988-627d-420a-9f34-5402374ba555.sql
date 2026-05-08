-- =====================================================
-- PHASE 3: Kommo outbound (Seialz -> Kommo) - DB layer
-- =====================================================
-- 1. Loop-guard GUC in event publisher
-- 2. Auto-manage kommo subscriptions per org

-- ---------- 1. Loop-guard ----------
CREATE OR REPLACE FUNCTION public.fn_publish_integration_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aggregate_type text := TG_ARGV[0];
  v_org_id uuid;
  v_event_type text;
  v_ts_epoch bigint;
  v_payload jsonb;
  v_idem text;
  v_stage_changed boolean := false;
  v_skip text;
BEGIN
  BEGIN
    -- Loop guard: callers (kommo handler write-back, kommo-migrate import)
    -- can SET LOCAL app.skip_event_emit = 'true' to suppress this trigger.
    BEGIN
      v_skip := current_setting('app.skip_event_emit', true);
    EXCEPTION WHEN OTHERS THEN
      v_skip := NULL;
    END;
    IF v_skip = 'true' THEN
      RETURN NEW;
    END IF;

    -- Filter: messages only outbound
    IF v_aggregate_type = 'message' THEN
      IF NEW.direction IS DISTINCT FROM 'outbound' THEN
        RETURN NEW;
      END IF;
    END IF;

    v_org_id := NEW.organization_id;

    IF v_aggregate_type = 'message' THEN
      v_ts_epoch := EXTRACT(EPOCH FROM COALESCE(NEW.created_at, now()))::bigint;
    ELSE
      v_ts_epoch := EXTRACT(EPOCH FROM COALESCE(NEW.updated_at, now()))::bigint;
    END IF;

    IF TG_OP = 'INSERT' THEN
      IF v_aggregate_type = 'message' THEN
        v_event_type := 'message.outbound_sent';
      ELSE
        v_event_type := v_aggregate_type || '.created';
      END IF;
    ELSE
      v_event_type := v_aggregate_type || '.updated';
      IF v_aggregate_type = 'opportunity'
         AND COALESCE(OLD.pipeline_stage_id::text, '') IS DISTINCT FROM COALESCE(NEW.pipeline_stage_id::text, '') THEN
        v_stage_changed := true;
      END IF;
    END IF;

    v_payload := to_jsonb(NEW);
    v_idem := v_aggregate_type || ':' || NEW.id::text || ':' || v_event_type || ':' || v_ts_epoch::text;

    INSERT INTO public.integration_events
      (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
    VALUES
      (v_org_id, v_aggregate_type, NEW.id, v_event_type, v_payload, v_idem)
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF v_stage_changed THEN
      v_event_type := 'opportunity.stage_changed';
      v_idem := v_aggregate_type || ':' || NEW.id::text || ':' || v_event_type || ':' || v_ts_epoch::text;
      INSERT INTO public.integration_events
        (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
      VALUES
        (v_org_id, v_aggregate_type, NEW.id, v_event_type,
         v_payload || jsonb_build_object('previous_stage_id', OLD.pipeline_stage_id),
         v_idem)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_publish_integration_event failed: %', SQLERRM;
    RETURN NEW;
  END;
END;
$$;

-- ---------- 2. Auto-manage Kommo outbound subscriptions ----------
CREATE OR REPLACE FUNCTION public.fn_manage_kommo_subscriptions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_event_types text[] := ARRAY[
    'contact.created',
    'contact.updated',
    'opportunity.created',
    'opportunity.updated',
    'opportunity.stage_changed'
  ];
  v_evt text;
BEGIN
  SELECT slug INTO v_slug FROM public.admin_integrations WHERE id = NEW.integration_id;
  IF v_slug IS DISTINCT FROM 'kommo' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_enabled = true THEN
    FOREACH v_evt IN ARRAY v_event_types LOOP
      INSERT INTO public.integration_subscriptions
        (organization_id, integration_slug, event_type, target_action, is_active, config)
      VALUES
        (NEW.organization_id, 'kommo', v_evt, 'upsert', true, '{}'::jsonb)
      ON CONFLICT DO NOTHING;
    END LOOP;
  ELSE
    UPDATE public.integration_subscriptions
    SET is_active = false
    WHERE organization_id = NEW.organization_id
      AND integration_slug = 'kommo'
      AND target_action = 'upsert';
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_manage_kommo_subscriptions failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_manage_kommo_subscriptions ON public.organization_integrations;
CREATE TRIGGER trg_manage_kommo_subscriptions
  AFTER INSERT OR UPDATE OF is_enabled ON public.organization_integrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_manage_kommo_subscriptions();

-- Add a partial unique index to allow the ON CONFLICT above to work (one active sub per org+event+action+slug)
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_subscriptions_org_slug_event_action
  ON public.integration_subscriptions(organization_id, integration_slug, event_type, target_action);

-- ---------- Backfill: enable for orgs already on Kommo ----------
INSERT INTO public.integration_subscriptions
  (organization_id, integration_slug, event_type, target_action, is_active, config)
SELECT oi.organization_id, 'kommo', evt, 'upsert', true, '{}'::jsonb
FROM public.organization_integrations oi
JOIN public.admin_integrations ai ON ai.id = oi.integration_id
CROSS JOIN unnest(ARRAY[
  'contact.created','contact.updated',
  'opportunity.created','opportunity.updated','opportunity.stage_changed'
]) AS evt
WHERE ai.slug = 'kommo' AND oi.is_enabled = true
ON CONFLICT DO NOTHING;