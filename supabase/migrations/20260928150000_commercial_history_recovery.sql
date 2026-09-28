-- Recover the initial acquisition from historical evidence, independently of marketing.
-- Later opportunities never inherit a contact's latest campaign/referral.
CREATE TABLE public.commercial_history_jobs (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','complete','error')),
 cursor_id uuid,
 examined integer NOT NULL DEFAULT 0,
 updated integer NOT NULL DEFAULT 0,
 requested_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 last_error text
);
ALTER TABLE public.commercial_history_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY commercial_history_jobs_read ON public.commercial_history_jobs FOR SELECT TO authenticated
 USING (commercial_has_permission(organization_id,'can_manage_settings'));
GRANT SELECT ON public.commercial_history_jobs TO authenticated;

CREATE FUNCTION public.commercial_queue_history(p_org uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT commercial_has_permission(p_org,'can_manage_settings') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=p_org AND enabled) THEN RAISE EXCEPTION 'Commercial origins disabled'; END IF;
 INSERT INTO commercial_history_jobs(organization_id) VALUES(p_org)
 ON CONFLICT(organization_id) DO UPDATE SET status='pending',cursor_id=NULL,examined=0,updated=0,requested_at=now(),finished_at=NULL,last_error=NULL;
END $$;
REVOKE ALL ON FUNCTION public.commercial_queue_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commercial_queue_history(uuid) TO authenticated;

CREATE FUNCTION public.commercial_history_enqueue_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=NEW.organization_id AND enabled) THEN
  INSERT INTO commercial_history_jobs(organization_id) VALUES(NEW.organization_id)
  ON CONFLICT(organization_id) DO UPDATE SET status='pending',cursor_id=NULL,examined=0,updated=0,requested_at=now(),finished_at=NULL,last_error=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.commercial_history_enqueue_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER commercial_history_rule_changed AFTER INSERT OR UPDATE ON public.commercial_message_rules
 FOR EACH ROW EXECUTE FUNCTION public.commercial_history_enqueue_trigger();
CREATE TRIGGER commercial_history_enabled AFTER INSERT OR UPDATE OF enabled ON public.commercial_origin_settings
 FOR EACH ROW WHEN (NEW.enabled) EXECUTE FUNCTION public.commercial_history_enqueue_trigger();

-- One evidence decoder for old and current provider payloads. JSON null must not hide raw.referral.
CREATE FUNCTION public.commercial_message_evidence(p_metadata jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT jsonb_strip_nulls(jsonb_build_object(
  'ctwa_clid',coalesce(nullif(p_metadata#>>'{meta_cloud,referral,ctwa_clid}',''),nullif(p_metadata#>>'{meta_cloud,raw,referral,ctwa_clid}',''),nullif(p_metadata#>>'{twilio,commercial_referral,ctwa_clid}',''),nullif(p_metadata#>>'{twilio,ReferralCtwaClid}','')),
  'source_type',coalesce(nullif(p_metadata#>>'{meta_cloud,referral,source_type}',''),nullif(p_metadata#>>'{meta_cloud,raw,referral,source_type}',''),nullif(p_metadata#>>'{twilio,commercial_referral,source_type}',''),nullif(p_metadata#>>'{twilio,ReferralSourceType}','')),
  'ad_id',coalesce(nullif(p_metadata#>>'{meta_cloud,referral,source_id}',''),nullif(p_metadata#>>'{meta_cloud,raw,referral,source_id}',''),nullif(p_metadata#>>'{twilio,commercial_referral,source_id}',''),nullif(p_metadata#>>'{twilio,ReferralSourceId}',''))));
$$;
REVOKE ALL ON FUNCTION public.commercial_message_evidence(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.commercial_recover_contact(p_org uuid,p_contact uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c contacts; m messages; o opportunities; e commercial_origin_events;
 v_evidence jsonb:='{}'; v_text text; v_endpoint uuid; v_message uuid; v_at timestamptz;
 v_initial boolean:=false; v_opp uuid; v_count integer; v_id uuid; r jsonb; n integer:=0;
BEGIN
 SELECT * INTO c FROM contacts WHERE id=p_contact AND organization_id=p_org AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN 0; END IF;
 -- Own opportunity evidence is authoritative for that opportunity, even when there are several.
 FOR o IN SELECT * FROM opportunities WHERE organization_id=p_org AND contact_id=c.id AND deleted_at IS NULL
   AND (source IN ('ctwa','meta_lead_ads','meta_ads','google_ads','backfill_ctwa_7067') OR nullif(utm_source,'') IS NOT NULL)
   ORDER BY created_at,id
 LOOP
  INSERT INTO commercial_origin_events(organization_id,external_key,contact_id,opportunity_id,channel,occurred_at,entry_verified,evidence)
  VALUES(p_org,'legacy-opportunity:'||o.id,c.id,o.id,CASE WHEN o.source IN ('ctwa','backfill_ctwa_7067') THEN 'whatsapp' ELSE 'legacy' END,o.created_at,true,
    jsonb_strip_nulls(jsonb_build_object('source',CASE WHEN o.source='backfill_ctwa_7067' THEN 'ctwa' ELSE o.source END,'utm_source',o.utm_source,'utm_medium',o.utm_medium,'utm_campaign',o.utm_campaign,'campaign_id',o.marketing_campaign_id,'legacy_opportunity',true)))
  ON CONFLICT(organization_id,external_key) DO NOTHING;
  SELECT id INTO v_id FROM commercial_origin_events WHERE organization_id=p_org AND external_key='legacy-opportunity:'||o.id;
  IF NOT EXISTS(SELECT 1 FROM commercial_attributions WHERE organization_id=p_org AND entity_type='opportunity' AND entity_id=o.id AND (origin_id IS NOT NULL OR method='manual')) THEN
   r:=commercial_process_event(v_id); n:=n+coalesce((r->>'updated')::integer,0);
  END IF;
 END LOOP;

 -- First observed inbound must belong to the creation session. An old imported contact's
 -- latest conversation is not evidence of its acquisition. Never choose a later matching text.
 SELECT msg.* INTO m FROM message_threads t JOIN messages msg ON msg.thread_id=t.id AND msg.organization_id=t.organization_id
 WHERE t.organization_id=p_org AND t.contact_id=c.id AND t.channel='whatsapp' AND msg.direction='inbound' AND msg.deleted_at IS NULL
 ORDER BY coalesce(msg.sent_at,msg.created_at),msg.created_at,msg.id LIMIT 1;
 IF m.id IS NOT NULL AND coalesce(m.sent_at,m.created_at) BETWEEN c.created_at-interval '1 minute' AND c.created_at+interval '10 minutes' THEN
  v_initial:=true; v_at:=coalesce(m.sent_at,m.created_at); v_endpoint:=m.endpoint_id; v_message:=m.id;
  v_evidence:=commercial_message_evidence(m.metadata);
  IF m.media_type IS NULL AND coalesce(m.metadata#>>'{meta_cloud,raw,type}','text')='text' THEN v_text:=m.content; END IF;
 END IF;
 -- Contact referral columns are mutable. Use them only if captured during creation,
 -- never a referral captured on a subsequent visit. The preserved message wins key by key.
 IF c.ad_referral_captured_at BETWEEN c.created_at-interval '1 minute' AND c.created_at+interval '1 minute' THEN
  v_evidence:=jsonb_strip_nulls(jsonb_build_object('ctwa_clid',nullif(c.ad_referral_ctwa_clid,''),'source_type',nullif(c.ad_referral_source_type,''),'ad_id',nullif(c.ad_referral_source_id,'')))||v_evidence;
  IF v_evidence<>'{}' THEN v_initial:=true; v_at:=coalesce(v_at,c.created_at); END IF;
 END IF;
 -- An initial form opportunity has its own immutable acquisition fields.
 IF NOT v_initial THEN
  SELECT * INTO o FROM opportunities WHERE organization_id=p_org AND contact_id=c.id AND deleted_at IS NULL
    AND created_at BETWEEN c.created_at-interval '1 minute' AND c.created_at+interval '1 minute'
    AND source IN ('meta_lead_ads','google_ads') ORDER BY created_at,id LIMIT 1;
  IF o.id IS NOT NULL THEN
   v_initial:=true; v_at:=c.created_at;
   v_evidence:=jsonb_strip_nulls(jsonb_build_object('source',o.source,'utm_source',o.utm_source,'utm_medium',o.utm_medium,'utm_campaign',o.utm_campaign,'campaign_id',o.marketing_campaign_id,'legacy_opportunity',true));
  END IF;
 END IF;
 IF v_initial THEN
  -- Reconstruct only the single opportunity created in that same initial session.
  -- Several candidates, or later opportunities, remain independent and are not guessed.
  SELECT count(*),(array_agg(id ORDER BY created_at,id))[1] INTO v_count,v_opp FROM opportunities
   WHERE organization_id=p_org AND contact_id=c.id AND deleted_at IS NULL
    AND created_at BETWEEN c.created_at-interval '1 minute' AND c.created_at+interval '10 minutes';
  IF v_count<>1 THEN v_opp:=NULL; END IF;
  v_evidence:=v_evidence||jsonb_build_object('historical_initial',true,'link_basis','unique_initial_creation_session','contact_created_at',c.created_at);
  INSERT INTO commercial_origin_events(organization_id,external_key,contact_id,opportunity_id,message_id,endpoint_id,channel,occurred_at,first_contact_entry,entry_verified,text_content,evidence)
  VALUES(p_org,'historical-initial:'||c.id,c.id,v_opp,v_message,v_endpoint,CASE WHEN v_message IS NOT NULL OR v_evidence ? 'ctwa_clid' OR v_evidence->>'source_type'='ad' THEN 'whatsapp' ELSE 'legacy' END,v_at,true,true,v_text,v_evidence)
  ON CONFLICT(organization_id,external_key) DO NOTHING;
  SELECT id INTO v_id FROM commercial_origin_events WHERE organization_id=p_org AND external_key='historical-initial:'||c.id;
  r:=commercial_resolve_event(v_id);
  IF r->>'status'='matched' THEN
   -- Do not keep incrementing revisions of unknown entries. Known/manual entries are protected.
   IF NOT EXISTS(SELECT 1 FROM commercial_attributions WHERE organization_id=p_org AND entity_type='contact' AND entity_id=c.id AND (origin_id IS NOT NULL OR method='manual'))
      OR (v_opp IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_attributions WHERE organization_id=p_org AND entity_type='opportunity' AND entity_id=v_opp AND (origin_id IS NOT NULL OR method='manual'))) THEN
    r:=commercial_process_event(v_id); n:=n+coalesce((r->>'updated')::integer,0);
   END IF;
  ELSE
   UPDATE commercial_origin_events SET result=r,processed_at=now() WHERE id=v_id;
  END IF;
 END IF;
 -- Verified entries captured before a rule was added are re-evaluated as well.
 FOR e IN SELECT * FROM commercial_origin_events ev WHERE ev.organization_id=p_org AND ev.contact_id=c.id AND ev.entry_verified
   AND ev.external_key NOT LIKE 'historical-initial:%' AND ev.external_key NOT LIKE 'legacy-opportunity:%'
   AND ((ev.first_contact_entry AND NOT EXISTS(SELECT 1 FROM commercial_attributions a WHERE a.organization_id=p_org AND a.entity_type='contact' AND a.entity_id=c.id AND (a.origin_id IS NOT NULL OR a.method='manual')))
    OR (ev.opportunity_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_attributions a WHERE a.organization_id=p_org AND a.entity_type='opportunity' AND a.entity_id=ev.opportunity_id AND (a.origin_id IS NOT NULL OR a.method='manual'))))
   ORDER BY ev.occurred_at,ev.id
 LOOP
  r:=commercial_resolve_event(e.id);
  IF r->>'status'='matched' THEN r:=commercial_process_event(e.id); n:=n+coalesce((r->>'updated')::integer,0); END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.commercial_recover_contact(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.commercial_history_run_batch(p_org uuid,p_limit integer DEFAULT 200) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j commercial_history_jobs; c record; n integer:=0; u integer:=0; last_id uuid;
BEGIN
 SELECT * INTO j FROM commercial_history_jobs WHERE organization_id=p_org FOR UPDATE SKIP LOCKED;
 IF NOT FOUND OR j.status NOT IN ('pending','running') OR NOT EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=p_org AND enabled) THEN RETURN '{"status":"idle"}'; END IF;
 BEGIN
  FOR c IN SELECT id FROM contacts WHERE organization_id=p_org AND deleted_at IS NULL AND (j.cursor_id IS NULL OR id>j.cursor_id) ORDER BY id LIMIT least(greatest(p_limit,1),500)
  LOOP
   u:=u+commercial_recover_contact(p_org,c.id); n:=n+1; last_id:=c.id;
  END LOOP;
  UPDATE commercial_history_jobs SET cursor_id=coalesce(last_id,cursor_id),examined=examined+n,updated=updated+u,
   status=CASE WHEN n<least(greatest(p_limit,1),500) THEN 'complete' ELSE 'running' END,
   finished_at=CASE WHEN n<least(greatest(p_limit,1),500) THEN now() END,last_error=NULL WHERE organization_id=p_org;
 EXCEPTION WHEN OTHERS THEN
  UPDATE commercial_history_jobs SET status='error',last_error=SQLERRM WHERE organization_id=p_org;
  RETURN jsonb_build_object('status','error','error',SQLERRM);
 END;
 RETURN jsonb_build_object('examined',n,'updated',u);
END $$;
REVOKE ALL ON FUNCTION public.commercial_history_run_batch(uuid,integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.commercial_history_tick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j record;
BEGIN
 FOR j IN SELECT h.organization_id FROM commercial_history_jobs h JOIN commercial_origin_settings s USING(organization_id)
   WHERE h.status IN ('pending','running') AND s.enabled ORDER BY h.requested_at LIMIT 5
 LOOP
  PERFORM commercial_history_run_batch(j.organization_id,200);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.commercial_history_tick() FROM PUBLIC,anon,authenticated;
-- The worker continues after the settings page is closed; a failed batch rolls back and is visible.
SELECT cron.schedule('commercial-history-recovery','* * * * *','SELECT public.commercial_history_tick()');
INSERT INTO commercial_history_jobs(organization_id) SELECT organization_id FROM commercial_origin_settings WHERE enabled ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.commercial_resolve_event(p_event uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e commercial_origin_events; v_code text; v_origin uuid; v_campaign uuid; v_count int; v_meta boolean; v_google boolean; v_result jsonb; v_marker text;
BEGIN
 SELECT * INTO STRICT e FROM commercial_origin_events WHERE id=p_event;
 v_marker:=substring(e.text_content from '\[src:([^|\]]+)');
 v_meta:=COALESCE(e.evidence->>'ctwa_clid','')<>'' OR e.evidence->>'source_type' IN ('ad','lead_ad','lead_form');
 v_meta:=COALESCE(v_meta,false) OR e.evidence->>'source' IN ('ctwa','meta_lead_ads','meta_ads') OR (lower(e.evidence->>'utm_source') IN ('meta','meta_ads','facebook','instagram') AND lower(e.evidence->>'utm_medium') IN ('cpc','paid','paid_social','paidsocial','ctwa'));
 v_google:=COALESCE(e.evidence->>'gclid','')<>'' OR e.evidence->>'source'='google_ads'
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
   SELECT count(*),(array_agg(id))[1] INTO v_count,v_campaign FROM marketing_campaigns m
   WHERE m.organization_id=e.organization_id AND m.deleted_at IS NULL
    AND ((v_code='meta_ads' AND lower(m.platform) IN ('meta','facebook','meta_ads')) OR (v_code='google_ads' AND lower(m.platform) IN ('google','google_ads')))
    AND ((NULLIF(e.evidence->>'ad_id','') IS NOT NULL AND (m.ad_id=e.evidence->>'ad_id' OR m.external_id=e.evidence->>'ad_id'))
      OR (NULLIF(e.evidence->>'campaign_id','') IS NOT NULL AND m.id::text=e.evidence->>'campaign_id')
      OR (NULLIF(e.evidence->>'utm_campaign','') IS NOT NULL AND (m.campaign_id=e.evidence->>'utm_campaign' OR m.campaign_name=e.evidence->>'utm_campaign' OR m.external_id=e.evidence->>'utm_campaign')));
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

CREATE OR REPLACE FUNCTION public.commercial_process_event(p_event uuid,p_enrich boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e commercial_origin_events; r jsonb; v_count int:=0;
BEGIN
 SELECT * INTO STRICT e FROM commercial_origin_events WHERE id=p_event FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=e.organization_id AND enabled) THEN RETURN '{"status":"disabled"}'; END IF;
 r:=commercial_resolve_event(e.id);
 -- Unlinked text is review material only, never an acquisition.
 IF r->>'status'<>'unlinked' THEN
  IF e.first_contact_entry AND e.entry_verified THEN
   IF commercial_write_attribution(e.organization_id,'contact',e.contact_id,e.id,r,e.channel,CASE WHEN e.evidence->>'historical_initial'='true' OR e.evidence->>'legacy_opportunity'='true' THEN 'Recuperação histórica da entrada inicial ou evidência própria' ELSE 'Entrada comercial' END,false,p_enrich) THEN v_count:=v_count+1; END IF;
  END IF;
  IF e.opportunity_id IS NOT NULL AND e.entry_verified THEN
   IF commercial_write_attribution(e.organization_id,'opportunity',e.opportunity_id,e.id,r,e.channel,CASE WHEN e.evidence->>'historical_initial'='true' OR e.evidence->>'legacy_opportunity'='true' THEN 'Recuperação histórica da entrada inicial ou evidência própria' ELSE 'Entrada comercial' END,false,p_enrich) THEN v_count:=v_count+1; END IF;
  END IF;
 END IF;
 UPDATE commercial_origin_events SET result=r,processed_at=now(),process_error=NULL WHERE id=e.id;
 RETURN r||jsonb_build_object('updated',v_count);
END $$;

CREATE OR REPLACE FUNCTION public.commercial_message_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_contact uuid; v_info jsonb; v_ref jsonb; v_evidence jsonb; v_opp uuid; v_first boolean; v_text text;
BEGIN
 IF NEW.direction<>'inbound' OR NOT EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=NEW.organization_id AND enabled) THEN RETURN NEW; END IF;
 SELECT contact_id INTO v_contact FROM message_threads WHERE id=NEW.thread_id AND organization_id=NEW.organization_id AND channel='whatsapp';
 IF v_contact IS NULL THEN RETURN NEW; END IF;
 v_info:=COALESCE(NEW.metadata->'commercial_entry','{}');
 v_ref:=COALESCE(NEW.metadata#>'{meta_cloud,referral}',NEW.metadata#>'{twilio,commercial_referral}','{}');
 v_evidence:=commercial_message_evidence(NEW.metadata);
 v_opp:=NULLIF(v_info->>'opportunity_id','')::uuid;
 v_first:=COALESCE((v_info->>'first_contact_entry')::boolean,false);
 IF NEW.media_type IS NULL AND (NEW.metadata#>>'{meta_cloud,raw,type}' IS NULL OR NEW.metadata#>>'{meta_cloud,raw,type}'='text') THEN v_text:=NEW.content; END IF;
 PERFORM commercial_capture(NEW.organization_id,'message:'||NEW.id,v_contact,v_opp,'whatsapp',NEW.created_at,v_first,v_first OR v_opp IS NOT NULL,
   v_evidence,NEW.id,NEW.endpoint_id,v_text);
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'commercial_capture_failed message=% state=% error=%',NEW.id,SQLSTATE,SQLERRM;
 RETURN NEW;
END $$;
