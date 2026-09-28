-- LP payload aliases and precise campaign matching, tenant-scoped.
-- An exact ad match takes precedence over broader campaign/adset matches.
CREATE OR REPLACE FUNCTION public.commercial_resolve_event(p_event uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e commercial_origin_events; v_code text; v_origin uuid; v_campaign uuid; v_count int; v_meta boolean; v_google boolean; v_result jsonb; v_marker text;
BEGIN
 SELECT * INTO STRICT e FROM commercial_origin_events WHERE id=p_event;
 v_marker:=substring(e.text_content from '\[src:([^|\]]+)');
 v_meta:=COALESCE(e.evidence->>'ctwa_clid','')<>'' OR e.evidence->>'source_type' IN ('ad','lead_ad','lead_form');
 v_meta:=COALESCE(v_meta,false) OR e.evidence->>'source' IN ('ctwa','meta_lead_ads','meta_ads') OR (e.entry_verified AND e.channel='form' AND lower(e.evidence->>'source')='meta' AND coalesce(lower(e.evidence->>'utm_medium'),'') NOT IN ('organic','social','referral')) OR (lower(e.evidence->>'utm_source') IN ('meta','meta_ads','facebook','instagram','fb','ig') AND lower(e.evidence->>'utm_medium') IN ('cpc','paid','paid_social','paidsocial','ctwa'));
 v_google:=COALESCE(e.evidence->>'gclid','')<>'' OR e.evidence->>'source' IN ('google_ads','gads')
   OR (lower(e.evidence->>'utm_source')='google' AND lower(e.evidence->>'utm_medium') IN ('cpc','ppc','paid','display'))
   OR (e.entry_verified AND lower(v_marker)='gads');
 IF COALESCE(v_meta,false) AND COALESCE(v_google,false) THEN RETURN '{"status":"conflict","method":"unknown","reason":"direct_evidence_conflict"}'; END IF;
 IF v_meta THEN v_code:='meta_ads'; ELSIF v_google THEN v_code:='google_ads';
 ELSIF lower(e.evidence->>'utm_source')='google' AND lower(e.evidence->>'utm_medium')='organic' THEN v_code:='google_organic';
 ELSIF lower(e.evidence->>'utm_medium') IN ('cpc','ppc','paid','display','paid_social','paidsocial') THEN v_code:='paid_other';
 ELSIF e.entry_verified AND lower(v_marker)='direct' THEN v_code:='direct'; END IF;
 IF v_code IS NOT NULL THEN
   SELECT id INTO v_origin FROM commercial_origins WHERE organization_id=e.organization_id AND code=v_code;
   -- Never derive campaign from a stale contact or a click ID alone.
   WITH candidates AS (
    SELECT m.id, CASE
     WHEN nullif(e.evidence->>'ad_id','') IS NOT NULL AND (m.ad_id=e.evidence->>'ad_id' OR m.external_id=e.evidence->>'ad_id') THEN 1
     WHEN nullif(e.evidence->>'campaign_id','') IS NOT NULL AND m.id::text=e.evidence->>'campaign_id' THEN 1
     WHEN nullif(e.evidence->>'meta_adset_id','') IS NOT NULL AND m.adset_id=e.evidence->>'meta_adset_id' THEN 2
     WHEN nullif(e.evidence->>'meta_campaign_id','') IS NOT NULL AND m.campaign_id=e.evidence->>'meta_campaign_id' THEN 3
     WHEN nullif(e.evidence->>'utm_campaign','') IS NOT NULL AND (m.campaign_id=e.evidence->>'utm_campaign' OR m.campaign_name=e.evidence->>'utm_campaign' OR m.external_id=e.evidence->>'utm_campaign') THEN 4
    END AS priority
    FROM marketing_campaigns m
    WHERE m.organization_id=e.organization_id AND m.deleted_at IS NULL
     AND ((v_code='meta_ads' AND lower(m.platform) IN ('meta','facebook','meta_ads')) OR (v_code='google_ads' AND lower(m.platform) IN ('google','google_ads')))
   )
   SELECT count(*),(array_agg(id))[1] INTO v_count,v_campaign FROM candidates
    WHERE priority=(SELECT min(priority) FROM candidates);
   RETURN jsonb_build_object('status','matched','origin_id',v_origin,'campaign_id',CASE WHEN v_count=1 THEN v_campaign END,
    'method',CASE WHEN (e.evidence->>'legacy_opportunity'='true' OR e.evidence->>'historical_initial'='true') THEN 'migrated' ELSE 'direct' END,'campaign_pending',v_count>1,'evidence',e.evidence);
 END IF;
 IF e.channel='whatsapp' AND e.text_content IS NOT NULL THEN
   v_result:=commercial_match_message(e.organization_id,e.text_content,e.endpoint_id);
   IF NOT e.entry_verified AND v_result->>'status'<>'unknown' THEN
    RETURN v_result||jsonb_build_object('status','unlinked','reason','entry_not_verified');
   END IF;
   RETURN v_result||CASE WHEN e.evidence->>'historical_initial'='true' THEN jsonb_build_object('historical_initial',true,'link_basis',e.evidence->>'link_basis') ELSE '{}'::jsonb END;
 END IF;
 RETURN '{"status":"unknown","method":"unknown"}';
END $$;

