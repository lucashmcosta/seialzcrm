DO $$
DECLARE
  v_org uuid := 'b246ef6f-6242-4011-a112-6d8783d2896a';
  r record;
  v_result text;
  v_assigned int := 0;
  v_ambiguous int := 0;
  v_no_match int := 0;
  v_already int := 0;
  v_other int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.contacts
    WHERE organization_id = v_org
      AND deleted_at IS NULL
      AND marketing_campaign_id IS NULL
      AND (utm_campaign IS NOT NULL OR utm_content IS NOT NULL OR utm_term IS NOT NULL)
  LOOP
    v_result := public.fn_log_marketing_attribution_attempt(v_org, r.id);
    IF v_result = 'assigned' THEN v_assigned := v_assigned + 1;
    ELSIF v_result = 'ambiguous' THEN v_ambiguous := v_ambiguous + 1;
    ELSIF v_result = 'no_match' THEN v_no_match := v_no_match + 1;
    ELSIF v_result = 'already_assigned' THEN v_already := v_already + 1;
    ELSE v_other := v_other + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Viagi backfill — assigned=% ambiguous=% no_match=% already=% other=%',
    v_assigned, v_ambiguous, v_no_match, v_already, v_other;
END $$;