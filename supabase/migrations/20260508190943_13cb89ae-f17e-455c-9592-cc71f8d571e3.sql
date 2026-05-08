CREATE OR REPLACE FUNCTION public.fn_publish_integration_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aggregate_type text := TG_ARGV[0];
  v_org_id uuid;
  v_event_type text;
  v_ts_epoch bigint;
  v_payload jsonb;
  v_idem text;
  v_stage_changed boolean := false;
BEGIN
  BEGIN
    -- Filter: messages only outbound
    IF v_aggregate_type = 'message' THEN
      IF NEW.direction IS DISTINCT FROM 'outbound' THEN
        RETURN NEW;
      END IF;
    END IF;

    v_org_id := NEW.organization_id;

    -- timestamp epoch: messages use created_at; others use updated_at
    IF v_aggregate_type = 'message' THEN
      v_ts_epoch := EXTRACT(EPOCH FROM COALESCE(NEW.created_at, now()))::bigint;
    ELSE
      v_ts_epoch := EXTRACT(EPOCH FROM COALESCE(NEW.updated_at, now()))::bigint;
    END IF;

    -- Determine event_type
    IF TG_OP = 'INSERT' THEN
      IF v_aggregate_type = 'message' THEN
        v_event_type := 'message.outbound_sent';
      ELSE
        v_event_type := v_aggregate_type || '.created';
      END IF;
    ELSE
      v_event_type := v_aggregate_type || '.updated';
      -- detect stage change for opportunities (only on UPDATE)
      -- nested IFs to enable lazy parse of OLD.pipeline_stage_id (only exists on opportunities)
      IF v_aggregate_type = 'opportunity' THEN
        IF COALESCE(OLD.pipeline_stage_id::text, '') IS DISTINCT FROM COALESCE(NEW.pipeline_stage_id::text, '') THEN
          v_stage_changed := true;
        END IF;
      END IF;
    END IF;

    v_payload := to_jsonb(NEW);
    v_idem := v_aggregate_type || ':' || NEW.id::text || ':' || v_event_type || ':' || v_ts_epoch::text;

    INSERT INTO public.integration_events
      (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
    VALUES
      (v_org_id, v_aggregate_type, NEW.id, v_event_type, v_payload, v_idem)
    ON CONFLICT (idempotency_key) DO NOTHING;

    -- Second event when stage changed
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
$function$;