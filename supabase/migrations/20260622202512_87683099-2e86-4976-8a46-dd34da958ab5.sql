
-- ============================================================
-- Outbox: opportunity.won enriched event
-- Emits ONE event per opportunity on transition into a 'won' stage.
-- Idempotency: seialz:opportunity.won:{org}:{opportunity}
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_build_opportunity_won_payload(_opportunity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH op AS (
    SELECT o.* FROM public.opportunities o WHERE o.id = _opportunity_id
  ),
  ct AS (
    SELECT c.* FROM public.contacts c
    JOIN op ON op.contact_id = c.id
  ),
  -- Attachments: opportunity + contact, deduped by attachment id
  att AS (
    SELECT DISTINCT ON (a.id)
      a.id, a.entity_type, a.entity_id, a.bucket, a.storage_path,
      a.file_name, a.mime_type, a.size_bytes, a.uploaded_by_user_id, a.created_at
    FROM public.attachments a, op, ct
    WHERE a.deleted_at IS NULL
      AND (
        (a.entity_type = 'opportunity' AND a.entity_id = op.id)
        OR (a.entity_type = 'contact' AND a.entity_id = ct.id)
      )
  ),
  subs AS (
    SELECT
      ds.id, ds.status, ds.document_type_id, ds.attachment_id,
      dt.code AS document_type_code, dt.name AS document_type_name,
      a.file_name, a.mime_type, a.size_bytes, a.bucket, a.storage_path
    FROM public.document_submissions ds
    JOIN ct ON ct.id = ds.contact_id
    JOIN public.document_types dt ON dt.id = ds.document_type_id
    JOIN public.attachments a ON a.id = ds.attachment_id AND a.deleted_at IS NULL
    WHERE ds.status = 'approved'
      AND ds.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'event_version', '1.0',
    'source', 'seialz_crm',
    'organization_id', op.organization_id,
    'opportunity', jsonb_build_object(
      'id', op.id,
      'title', op.title,
      'amount', op.amount,
      'currency', op.currency,
      'status', op.status,
      'pipeline_stage_id', op.pipeline_stage_id,
      'close_date', op.close_date,
      'owner_user_id', op.owner_user_id
    ),
    'contact', jsonb_build_object(
      'id', ct.id,
      'full_name', ct.full_name,
      'first_name', ct.first_name,
      'last_name', ct.last_name,
      'email', ct.email,
      'phone', ct.phone,
      'cpf', ct.cpf,
      'rg', ct.rg,
      'rg_issuer', ct.rg_issuer,
      'nationality', ct.nationality,
      'address_street', ct.address_street,
      'address_neighborhood', ct.address_neighborhood,
      'address_city', ct.address_city,
      'address_state', ct.address_state,
      'address_zip', ct.address_zip
    ),
    'attachments', COALESCE((SELECT jsonb_agg(to_jsonb(att.*) ORDER BY att.created_at) FROM att), '[]'::jsonb),
    'document_submissions', COALESCE((SELECT jsonb_agg(to_jsonb(subs.*)) FROM subs), '[]'::jsonb)
  )
  FROM op, ct;
$$;

CREATE OR REPLACE FUNCTION public.fn_emit_opportunity_won_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_is_won boolean;
  v_old_is_won boolean := false;
  v_payload jsonb;
  v_idem text;
BEGIN
  -- New row must be alive, have org and contact
  IF NEW.deleted_at IS NOT NULL OR NEW.organization_id IS NULL OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (ps.type = 'won') INTO v_new_is_won
  FROM public.pipeline_stages ps WHERE ps.id = NEW.pipeline_stage_id;

  IF v_new_is_won IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.pipeline_stage_id IS NOT NULL THEN
    SELECT (ps.type = 'won') INTO v_old_is_won
    FROM public.pipeline_stages ps WHERE ps.id = OLD.pipeline_stage_id;
  END IF;

  -- Only emit on transition into won
  IF COALESCE(v_old_is_won, false) THEN
    RETURN NEW;
  END IF;

  v_idem := 'seialz:opportunity.won:' || NEW.organization_id::text || ':' || NEW.id::text;
  v_payload := public.fn_build_opportunity_won_payload(NEW.id);

  INSERT INTO public.integration_events (
    organization_id, aggregate_type, aggregate_id, event_type,
    payload, idempotency_key, occurred_at, status
  ) VALUES (
    NEW.organization_id, 'opportunity', NEW.id, 'opportunity.won',
    v_payload, v_idem, now(), 'pending'
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_opportunity_won ON public.opportunities;
CREATE TRIGGER trg_emit_opportunity_won
AFTER INSERT OR UPDATE OF pipeline_stage_id, deleted_at ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.fn_emit_opportunity_won_event();
