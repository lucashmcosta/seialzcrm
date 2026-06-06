
-- Parser do marcador [src:xxx|g:GCLID] em mensagens inbound
CREATE OR REPLACE FUNCTION public.parse_lead_source_marker_from_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src text;
  v_gclid text;
  v_contact_id uuid;
BEGIN
  IF NEW.direction IS DISTINCT FROM 'inbound' THEN
    RETURN NEW;
  END IF;

  IF NEW.content IS NULL OR NEW.content !~ '\[src:[^\]]+\]' THEN
    RETURN NEW;
  END IF;

  -- Escopo v1: apenas Central Trabalhista
  IF NEW.organization_id <> '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'::uuid THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_src := lower(substring(NEW.content from '\[src:([^|\]]+)'));
    v_gclid := substring(NEW.content from '\|g:([^\]]+)\]');

    SELECT contact_id INTO v_contact_id
    FROM public.message_threads
    WHERE id = NEW.thread_id;

    IF v_contact_id IS NULL OR v_src IS NULL THEN
      RETURN NEW;
    END IF;

    IF v_src = 'gads' THEN
      UPDATE public.contacts
      SET
        utm_source = COALESCE(utm_source, 'google'),
        utm_medium = COALESCE(utm_medium, 'cpc'),
        source = COALESCE(source, 'google_ads'),
        gclid = COALESCE(gclid, v_gclid)
      WHERE id = v_contact_id
        AND (utm_source IS NULL OR gclid IS NULL);
    ELSIF v_src = 'direct' THEN
      UPDATE public.contacts
      SET
        utm_source = COALESCE(utm_source, 'direct'),
        utm_medium = COALESCE(utm_medium, 'none')
      WHERE id = v_contact_id
        AND utm_source IS NULL;
    ELSE
      UPDATE public.contacts
      SET utm_source = COALESCE(utm_source, v_src)
      WHERE id = v_contact_id
        AND utm_source IS NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- nunca falhar a inserção da mensagem
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parse_lead_source_marker ON public.messages;
CREATE TRIGGER trg_parse_lead_source_marker
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.parse_lead_source_marker_from_message();

-- Backfill: contatos existentes da Central Trabalhista cuja primeira mensagem inbound contém [src:...]
WITH first_marker AS (
  SELECT DISTINCT ON (t.contact_id)
    t.contact_id,
    lower(substring(m.content from '\[src:([^|\]]+)')) AS src,
    substring(m.content from '\|g:([^\]]+)\]') AS gclid
  FROM public.messages m
  JOIN public.message_threads t ON t.id = m.thread_id
  WHERE m.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
    AND m.direction = 'inbound'
    AND m.content ~ '\[src:[^\]]+\]'
    AND t.contact_id IS NOT NULL
  ORDER BY t.contact_id, m.created_at ASC
)
UPDATE public.contacts c
SET
  utm_source = COALESCE(c.utm_source, CASE fm.src WHEN 'gads' THEN 'google' WHEN 'direct' THEN 'direct' ELSE fm.src END),
  utm_medium = COALESCE(c.utm_medium, CASE fm.src WHEN 'gads' THEN 'cpc' WHEN 'direct' THEN 'none' ELSE c.utm_medium END),
  source     = COALESCE(c.source, CASE fm.src WHEN 'gads' THEN 'google_ads' ELSE c.source END),
  gclid      = COALESCE(c.gclid, CASE WHEN fm.src = 'gads' THEN fm.gclid ELSE NULL END)
FROM first_marker fm
WHERE c.id = fm.contact_id
  AND (c.utm_source IS NULL OR (fm.src = 'gads' AND c.gclid IS NULL));
