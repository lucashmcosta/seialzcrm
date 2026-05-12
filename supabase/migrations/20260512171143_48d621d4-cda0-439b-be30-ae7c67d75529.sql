CREATE TABLE IF NOT EXISTS public.opportunities_status_backup_20260512 AS
SELECT o.id, o.status, o.close_date, o.pipeline_stage_id, o.organization_id, now() AS backed_up_at
FROM public.opportunities o
WHERE o.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND o.deleted_at IS NULL;

UPDATE public.opportunities o
SET 
  status = (CASE ps.type::text
    WHEN 'won' THEN 'won'
    WHEN 'lost' THEN 'lost'
    ELSE 'open'
  END)::opportunity_status,
  close_date = CASE 
    WHEN ps.type::text IN ('won','lost') AND o.close_date IS NULL 
      THEN COALESCE(o.updated_at, now())
    ELSE o.close_date
  END,
  updated_at = now()
FROM public.pipeline_stages ps
WHERE ps.id = o.pipeline_stage_id
  AND o.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND o.deleted_at IS NULL
  AND o.status::text IS DISTINCT FROM (CASE ps.type::text WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE 'open' END);

CREATE OR REPLACE FUNCTION public.sync_opportunity_status_from_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stage_type_text text;
  new_status text;
BEGIN
  IF NEW.pipeline_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id THEN
    SELECT ps.type::text INTO stage_type_text
    FROM public.pipeline_stages ps
    WHERE ps.id = NEW.pipeline_stage_id;

    new_status := CASE stage_type_text
      WHEN 'won' THEN 'won'
      WHEN 'lost' THEN 'lost'
      ELSE 'open'
    END;

    NEW.status := new_status::opportunity_status;
    IF new_status IN ('won','lost') AND NEW.close_date IS NULL THEN
      NEW.close_date := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_opportunity_status_from_stage ON public.opportunities;
CREATE TRIGGER trg_sync_opportunity_status_from_stage
BEFORE INSERT OR UPDATE OF pipeline_stage_id ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.sync_opportunity_status_from_stage();