-- Additive commercial attribution. Never writes legacy marketing columns.
CREATE TABLE public.commercial_origin_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE public.commercial_origins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, code), UNIQUE (organization_id, id)
);
CREATE TABLE public.commercial_message_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 999999),
  endpoint_id uuid REFERENCES public.communication_endpoints(id) ON DELETE CASCADE,
  operator text NOT NULL CHECK (operator IN ('exact', 'contains')),
  pattern text NOT NULL CHECK (length(btrim(pattern)) BETWEEN 1 AND 4000),
  origin_id uuid NOT NULL,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, origin_id) REFERENCES public.commercial_origins(organization_id,id)
);
CREATE TABLE public.commercial_origin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_key text NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  endpoint_id uuid REFERENCES public.communication_endpoints(id) ON DELETE SET NULL,
  channel text NOT NULL,
  occurred_at timestamptz NOT NULL,
  first_contact_entry boolean NOT NULL DEFAULT false,
  entry_verified boolean NOT NULL DEFAULT false,
  text_content text,
  evidence jsonb NOT NULL DEFAULT '{}',
  result jsonb NOT NULL DEFAULT '{}',
  process_error text,
  processed_at timestamptz,
  UNIQUE (organization_id, external_key), UNIQUE (organization_id,id)
);
CREATE TABLE public.commercial_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact','opportunity')),
  entity_id uuid NOT NULL,
  origin_id uuid,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.commercial_origin_events(id) ON DELETE SET NULL,
  channel text,
  method text NOT NULL CHECK (method IN ('direct','message_rule','manual','migrated','unknown')),
  pending boolean NOT NULL DEFAULT false,
  details jsonb NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,entity_type,entity_id),
  FOREIGN KEY (organization_id,origin_id) REFERENCES public.commercial_origins(organization_id,id)
);
CREATE TABLE public.commercial_attribution_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  actor_id uuid,
  reason text NOT NULL,
  before_data jsonb,
  after_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.commercial_attributions (organization_id,origin_id,entity_type,entity_id);
CREATE INDEX ON public.commercial_attributions (organization_id,campaign_id,method);
CREATE INDEX ON public.commercial_origin_events (organization_id,occurred_at,id);
CREATE INDEX ON public.commercial_origin_events (organization_id,contact_id);
CREATE INDEX ON public.commercial_attribution_history (organization_id,entity_type,entity_id,created_at);
CREATE INDEX ON public.commercial_message_rules (organization_id,active);

CREATE FUNCTION public.commercial_has_permission(p_org uuid,p_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM user_organizations u JOIN permission_profiles p ON p.id=u.permission_profile_id
    WHERE u.organization_id=p_org AND u.user_id=current_user_id() AND u.is_active
      AND COALESCE((p.permissions->>p_permission)::boolean,false));
$$;
CREATE FUNCTION public.commercial_can_read(p_org uuid,p_type text,p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE p_type
 WHEN 'contact' THEN commercial_has_permission(p_org,'can_view_contacts') AND EXISTS
   (SELECT 1 FROM contacts c WHERE c.organization_id=p_org AND c.id=p_id AND c.deleted_at IS NULL
     AND (user_can_view_all(p_org,'contacts') OR c.owner_user_id=current_user_id()))
 WHEN 'opportunity' THEN commercial_has_permission(p_org,'can_view_opportunities') AND EXISTS
   (SELECT 1 FROM opportunities o WHERE o.organization_id=p_org AND o.id=p_id AND o.deleted_at IS NULL
     AND (user_can_view_all(p_org,'opportunities') OR o.owner_user_id=current_user_id()))
 ELSE false END;
$$;

ALTER TABLE public.commercial_origin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_message_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_origin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_attribution_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY commercial_settings_read ON public.commercial_origin_settings FOR SELECT TO authenticated
 USING (organization_id=ANY(current_user_org_ids()));
CREATE POLICY commercial_origins_read ON public.commercial_origins FOR SELECT TO authenticated
 USING (organization_id=ANY(current_user_org_ids()));
CREATE POLICY commercial_rules_read ON public.commercial_message_rules FOR SELECT TO authenticated
 USING (commercial_has_permission(organization_id,'can_manage_settings'));
CREATE POLICY commercial_events_read ON public.commercial_origin_events FOR SELECT TO authenticated
 USING (commercial_can_read(organization_id,'contact',contact_id)
   AND (opportunity_id IS NULL OR commercial_can_read(organization_id,'opportunity',opportunity_id)));
CREATE POLICY commercial_attribution_read ON public.commercial_attributions FOR SELECT TO authenticated
 USING (commercial_can_read(organization_id,entity_type,entity_id));
CREATE POLICY commercial_history_read ON public.commercial_attribution_history FOR SELECT TO authenticated
 USING (commercial_can_read(organization_id,entity_type,entity_id));
GRANT SELECT ON public.commercial_origin_settings,public.commercial_origins,public.commercial_message_rules,
 public.commercial_origin_events,public.commercial_attributions,public.commercial_attribution_history TO authenticated;

CREATE FUNCTION public.commercial_validate_tenant() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='commercial_attributions' THEN
   IF NEW.entity_type='contact' AND NOT EXISTS(SELECT 1 FROM contacts WHERE id=NEW.entity_id AND organization_id=NEW.organization_id)
     OR NEW.entity_type='opportunity' AND NOT EXISTS(SELECT 1 FROM opportunities WHERE id=NEW.entity_id AND organization_id=NEW.organization_id)
   THEN RAISE EXCEPTION 'Invalid commercial entity'; END IF;
   IF NEW.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM commercial_origin_events e
     WHERE e.id=NEW.event_id AND e.organization_id=NEW.organization_id AND
       ((NEW.entity_type='contact' AND e.contact_id=NEW.entity_id) OR
        (NEW.entity_type='opportunity' AND EXISTS (SELECT 1 FROM opportunities o WHERE o.id=NEW.entity_id AND o.contact_id=e.contact_id AND o.organization_id=e.organization_id))))
   THEN RAISE EXCEPTION 'Invalid commercial event'; END IF;
 ELSE
   IF NEW.endpoint_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM communication_endpoints WHERE id=NEW.endpoint_id AND organization_id=NEW.organization_id)
   THEN RAISE EXCEPTION 'Invalid commercial endpoint'; END IF;
 END IF;
 IF TG_TABLE_NAME='commercial_origin_events' THEN
   IF NOT EXISTS(SELECT 1 FROM contacts WHERE id=NEW.contact_id AND organization_id=NEW.organization_id)
     OR (NEW.opportunity_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM opportunities WHERE id=NEW.opportunity_id AND organization_id=NEW.organization_id AND contact_id=NEW.contact_id))
     OR (NEW.message_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM messages m JOIN message_threads t ON t.id=m.thread_id
       WHERE m.id=NEW.message_id AND m.organization_id=NEW.organization_id AND t.organization_id=NEW.organization_id AND t.contact_id=NEW.contact_id))
   THEN RAISE EXCEPTION 'Invalid commercial entry'; END IF;
 ELSE
   IF NEW.campaign_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM marketing_campaigns WHERE id=NEW.campaign_id AND organization_id=NEW.organization_id AND deleted_at IS NULL)
   THEN RAISE EXCEPTION 'Invalid commercial campaign'; END IF;
 END IF;
 IF TG_TABLE_NAME='commercial_message_rules' AND TG_OP='UPDATE' THEN
   NEW.version := OLD.version+1; NEW.updated_at:=now();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commercial_rule_tenant BEFORE INSERT OR UPDATE ON public.commercial_message_rules FOR EACH ROW EXECUTE FUNCTION public.commercial_validate_tenant();
CREATE TRIGGER commercial_event_tenant BEFORE INSERT OR UPDATE ON public.commercial_origin_events FOR EACH ROW EXECUTE FUNCTION public.commercial_validate_tenant();
CREATE TRIGGER commercial_attribution_tenant BEFORE INSERT OR UPDATE ON public.commercial_attributions FOR EACH ROW EXECUTE FUNCTION public.commercial_validate_tenant();

CREATE FUNCTION public.commercial_normalize(p_text text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT lower(translate(btrim(regexp_replace(normalize(COALESCE(p_text,''), NFC),'[[:space:] ]+',' ','g')),
  'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝŸ','áàâãäåéèêëíìîïóòôõöúùûüçñýÿ'));
$$;
CREATE FUNCTION public.commercial_match_message(p_org uuid,p_text text,p_endpoint uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH matches AS (
  SELECT r.id,r.organization_id,r.name,r.operator,r.pattern,r.priority,r.endpoint_id,r.origin_id,r.version,
   CASE WHEN m.deleted_at IS NULL THEN m.id END campaign_id,
   (r.campaign_id IS NOT NULL AND (m.id IS NULL OR m.deleted_at IS NOT NULL)) campaign_pending,
   dense_rank() OVER(ORDER BY CASE operator WHEN 'exact' THEN 0 ELSE 1 END,priority) rank
  FROM commercial_message_rules r JOIN commercial_origins s ON s.id=r.origin_id AND s.organization_id=r.organization_id AND s.active
  LEFT JOIN marketing_campaigns m ON m.id=r.campaign_id AND m.organization_id=r.organization_id
  WHERE r.organization_id=p_org AND r.active AND (r.endpoint_id IS NULL OR r.endpoint_id=p_endpoint)
   AND commercial_normalize(r.pattern)<>'' AND CASE r.operator
    WHEN 'exact' THEN commercial_normalize(p_text)=commercial_normalize(r.pattern)
    ELSE strpos(commercial_normalize(p_text),commercial_normalize(r.pattern))>0 END
 ), winners AS (SELECT * FROM matches WHERE rank=1), results AS (
 SELECT count(DISTINCT (origin_id, campaign_id)) n FROM winners)
 SELECT jsonb_build_object('status',CASE WHEN n=0 THEN 'unknown' WHEN n>1 THEN 'conflict' ELSE 'matched' END,
  'origin_id',CASE WHEN n=1 THEN (SELECT origin_id FROM winners LIMIT 1) END,
  'campaign_id',CASE WHEN n=1 THEN (SELECT campaign_id FROM winners LIMIT 1) END,
  'method',CASE WHEN n=1 THEN 'message_rule' ELSE 'unknown' END,
  'campaign_pending',COALESCE((SELECT bool_or(campaign_pending) FROM winners),false),
  'rules',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'version',version,'operator',operator,'pattern',pattern,'priority',priority,'endpoint_id',endpoint_id,'origin_id',origin_id,'campaign_id',campaign_id)) FROM winners),'[]'::jsonb),
  'matches',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'version',version,'winner',rank=1)) FROM matches),'[]'::jsonb)) FROM results;
$$;
-- Internal matcher is not a data-exfiltration RPC. Only the checked simulator calls it.
REVOKE ALL ON FUNCTION public.commercial_match_message(uuid,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.commercial_configure(p_org uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_result jsonb;
BEGIN
 IF NOT commercial_has_permission(p_org,'can_manage_settings') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||':commercial-config',0));
 IF p_action='enable' THEN
   INSERT INTO commercial_origins(organization_id,code,name)
   SELECT p_org,x.code,x.name FROM (VALUES ('meta_ads','Meta Ads'),('google_ads','Google Ads'),('google_organic','Google orgânico'),
    ('paid_other','Outros anúncios'),('referral','Indicação'),('partner','Parceiro'),('event','Evento'),('direct','Acesso direto')) x(code,name)
   ON CONFLICT(organization_id,code) DO NOTHING;
   INSERT INTO commercial_origin_settings VALUES(p_org,COALESCE((p_data->>'enabled')::boolean,false))
    ON CONFLICT(organization_id) DO UPDATE SET enabled=EXCLUDED.enabled;
 ELSIF p_action='source' THEN
   v_id:=NULLIF(p_data->>'id','')::uuid;
   IF v_id IS NULL THEN
     INSERT INTO commercial_origins(organization_id,code,name) VALUES(p_org,'custom_'||gen_random_uuid(),p_data->>'name') RETURNING id INTO v_id;
   ELSE
     UPDATE commercial_origins SET name=p_data->>'name',active=COALESCE((p_data->>'active')::boolean,true) WHERE id=v_id AND organization_id=p_org;
     IF NOT FOUND THEN RAISE EXCEPTION 'Origin not found'; END IF;
   END IF;
 ELSIF p_action='rule' THEN
   IF commercial_normalize(p_data->>'pattern')='' THEN RAISE EXCEPTION 'Message text is required'; END IF;
   v_id:=NULLIF(p_data->>'id','')::uuid;
   IF v_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_message_rules WHERE id=v_id AND organization_id=p_org) THEN RAISE EXCEPTION 'Rule not found'; END IF;
   INSERT INTO commercial_message_rules(id,organization_id,name,active,priority,endpoint_id,operator,pattern,origin_id,campaign_id)
   VALUES(COALESCE(v_id,gen_random_uuid()),p_org,p_data->>'name',COALESCE((p_data->>'active')::boolean,true),COALESCE((p_data->>'priority')::integer,100),
    NULLIF(p_data->>'endpoint_id','')::uuid,p_data->>'operator',p_data->>'pattern',(p_data->>'origin_id')::uuid,NULLIF(p_data->>'campaign_id','')::uuid)
   ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,active=EXCLUDED.active,priority=EXCLUDED.priority,endpoint_id=EXCLUDED.endpoint_id,
    operator=EXCLUDED.operator,pattern=EXCLUDED.pattern,origin_id=EXCLUDED.origin_id,campaign_id=EXCLUDED.campaign_id RETURNING id INTO v_id;
 ELSIF p_action='simulate' THEN
   IF NULLIF(p_data->>'endpoint_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM communication_endpoints WHERE id=(p_data->>'endpoint_id')::uuid AND organization_id=p_org) THEN RAISE EXCEPTION 'Invalid endpoint'; END IF;
   RETURN commercial_match_message(p_org,p_data->>'text',NULLIF(p_data->>'endpoint_id','')::uuid);
 ELSE RAISE EXCEPTION 'Invalid action'; END IF;
 RETURN jsonb_build_object('id',v_id);
END $$;

CREATE FUNCTION public.commercial_resolve_event(p_event uuid) RETURNS jsonb
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
    'method',CASE WHEN e.evidence->>'legacy_opportunity'='true' THEN 'migrated' ELSE 'direct' END,'campaign_pending',v_count>1,'evidence',e.evidence);
 END IF;
 IF e.channel='whatsapp' AND e.text_content IS NOT NULL THEN
   v_result:=commercial_match_message(e.organization_id,e.text_content,e.endpoint_id);
   IF NOT e.entry_verified AND v_result->>'status'<>'unknown' THEN
    RETURN v_result||jsonb_build_object('status','unlinked','reason','entry_not_verified');
   END IF;
   RETURN v_result;
 END IF;
 RETURN '{"status":"unknown","method":"unknown"}';
END $$;
REVOKE ALL ON FUNCTION public.commercial_resolve_event(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.commercial_write_attribution(p_org uuid,p_type text,p_id uuid,p_event uuid,p_result jsonb,p_channel text,p_reason text,p_manual boolean DEFAULT false,p_enrich boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_row commercial_attributions; new_row commercial_attributions;
BEGIN
 -- Serialize per entity, including the not-yet-existing row case.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||p_type||p_id::text,0));
 SELECT * INTO old_row FROM commercial_attributions WHERE organization_id=p_org AND entity_type=p_type AND entity_id=p_id FOR UPDATE;
 IF NOT p_manual AND old_row.id IS NOT NULL THEN
  IF old_row.method='manual' THEN RETURN false; END IF;
  IF old_row.origin_id IS NOT NULL AND NOT COALESCE((p_enrich AND old_row.event_id=p_event AND
    ((old_row.method='message_rule' AND p_result->>'method'='direct') OR
     (old_row.origin_id::text=p_result->>'origin_id' AND old_row.campaign_id IS NULL AND NULLIF(p_result->>'campaign_id','') IS NOT NULL) OR
     p_result->>'reason'='direct_evidence_conflict')),false) THEN RETURN false; END IF;
 END IF;
 INSERT INTO commercial_attributions(organization_id,entity_type,entity_id,origin_id,campaign_id,event_id,channel,method,pending,details)
 VALUES(p_org,p_type,p_id,NULLIF(p_result->>'origin_id','')::uuid,NULLIF(p_result->>'campaign_id','')::uuid,p_event,p_channel,
  CASE WHEN p_manual THEN 'manual' ELSE COALESCE(p_result->>'method','unknown') END,
  COALESCE(p_result->>'status' IN ('conflict','unlinked'),false) OR COALESCE((p_result->>'campaign_pending')::boolean,false),p_result)
 ON CONFLICT(organization_id,entity_type,entity_id) DO UPDATE SET origin_id=EXCLUDED.origin_id,campaign_id=EXCLUDED.campaign_id,event_id=EXCLUDED.event_id,
  channel=EXCLUDED.channel,method=EXCLUDED.method,pending=EXCLUDED.pending,details=EXCLUDED.details,updated_at=now(),revision=commercial_attributions.revision+1
 RETURNING * INTO new_row;
 INSERT INTO commercial_attribution_history(organization_id,entity_type,entity_id,actor_id,reason,before_data,after_data)
 VALUES(p_org,p_type,p_id,current_user_id(),p_reason,CASE WHEN old_row.id IS NOT NULL THEN to_jsonb(old_row) END,to_jsonb(new_row));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.commercial_write_attribution(uuid,text,uuid,uuid,jsonb,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.commercial_process_event(p_event uuid,p_enrich boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e commercial_origin_events; r jsonb; v_count int:=0;
BEGIN
 SELECT * INTO STRICT e FROM commercial_origin_events WHERE id=p_event FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=e.organization_id AND enabled) THEN RETURN '{"status":"disabled"}'; END IF;
 r:=commercial_resolve_event(e.id);
 -- Unlinked text is review material only, never an acquisition.
 IF r->>'status'<>'unlinked' THEN
  IF e.first_contact_entry AND e.entry_verified THEN
   IF commercial_write_attribution(e.organization_id,'contact',e.contact_id,e.id,r,e.channel,'Entrada comercial',false,p_enrich) THEN v_count:=v_count+1; END IF;
  END IF;
  IF e.opportunity_id IS NOT NULL AND e.entry_verified THEN
   IF commercial_write_attribution(e.organization_id,'opportunity',e.opportunity_id,e.id,r,e.channel,'Entrada comercial',false,p_enrich) THEN v_count:=v_count+1; END IF;
  END IF;
 END IF;
 UPDATE commercial_origin_events SET result=r,processed_at=now(),process_error=NULL WHERE id=e.id;
 RETURN r||jsonb_build_object('updated',v_count);
END $$;
REVOKE ALL ON FUNCTION public.commercial_process_event(uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.commercial_capture(p_org uuid,p_key text,p_contact uuid,p_opportunity uuid,p_channel text,p_at timestamptz,p_first boolean,p_verified boolean,p_evidence jsonb DEFAULT '{}',p_message uuid DEFAULT NULL,p_endpoint uuid DEFAULT NULL,p_text text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; previous commercial_origin_events; merged jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=p_org AND enabled) THEN RETURN NULL; END IF;
 INSERT INTO commercial_origin_events(organization_id,external_key,contact_id,opportunity_id,channel,occurred_at,first_contact_entry,entry_verified,evidence,message_id,endpoint_id,text_content)
 VALUES(p_org,p_key,p_contact,p_opportunity,p_channel,COALESCE(p_at,now()),p_first,p_verified,p_evidence,p_message,p_endpoint,p_text)
 ON CONFLICT(organization_id,external_key) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  SELECT * INTO previous FROM commercial_origin_events WHERE organization_id=p_org AND external_key=p_key FOR UPDATE;
  IF previous.contact_id<>p_contact OR previous.opportunity_id IS DISTINCT FROM p_opportunity OR previous.message_id IS DISTINCT FROM p_message THEN
   RAISE EXCEPTION 'Commercial event identity mismatch';
  END IF;
  v_id:=previous.id;
  merged:=jsonb_strip_nulls(p_evidence)||jsonb_strip_nulls(previous.evidence);
  IF merged IS NOT DISTINCT FROM jsonb_strip_nulls(previous.evidence) AND previous.process_error IS NULL THEN RETURN v_id; END IF;
  UPDATE commercial_origin_events SET evidence=merged WHERE id=v_id;
 END IF;
 BEGIN PERFORM commercial_process_event(v_id,true);
 EXCEPTION WHEN OTHERS THEN UPDATE commercial_origin_events SET process_error=SQLERRM WHERE id=v_id; END;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.commercial_capture(uuid,text,uuid,uuid,text,timestamptz,boolean,boolean,jsonb,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_capture(uuid,text,uuid,uuid,text,timestamptz,boolean,boolean,jsonb,uuid,uuid,text) TO service_role;

CREATE FUNCTION public.commercial_message_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_contact uuid; v_info jsonb; v_ref jsonb; v_evidence jsonb; v_opp uuid; v_first boolean; v_text text;
BEGIN
 IF NEW.direction<>'inbound' OR NOT EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=NEW.organization_id AND enabled) THEN RETURN NEW; END IF;
 SELECT contact_id INTO v_contact FROM message_threads WHERE id=NEW.thread_id AND organization_id=NEW.organization_id AND channel='whatsapp';
 IF v_contact IS NULL THEN RETURN NEW; END IF;
 v_info:=COALESCE(NEW.metadata->'commercial_entry','{}');
 v_ref:=COALESCE(NEW.metadata#>'{meta_cloud,referral}',NEW.metadata#>'{twilio,commercial_referral}','{}');
 v_evidence:=jsonb_build_object('ctwa_clid',v_ref->>'ctwa_clid','source_type',v_ref->>'source_type','ad_id',v_ref->>'source_id');
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
CREATE TRIGGER commercial_capture_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.commercial_message_capture();

CREATE FUNCTION public.commercial_correct(p_org uuid,p_type text,p_id uuid,p_origin uuid,p_campaign uuid,p_reason text,p_event uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e commercial_origin_events; v_channel text;
BEGIN
 IF NOT commercial_can_read(p_org,p_type,p_id) OR NOT commercial_has_permission(p_org,CASE p_type WHEN 'contact' THEN 'can_edit_contacts' ELSE 'can_edit_opportunities' END) THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=p_org AND enabled) THEN RAISE EXCEPTION 'Commercial origins disabled'; END IF;
 IF length(btrim(COALESCE(p_reason,'')))<3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
 IF p_event IS NOT NULL THEN
  SELECT * INTO e FROM commercial_origin_events WHERE id=p_event AND organization_id=p_org;
  IF NOT FOUND OR NOT commercial_can_read(p_org,'contact',e.contact_id) THEN RAISE EXCEPTION 'Invalid event'; END IF;
  v_channel:=e.channel;
 END IF;
 IF p_origin IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_origins WHERE id=p_origin AND organization_id=p_org AND active) THEN RAISE EXCEPTION 'Invalid origin'; END IF;
 RETURN commercial_write_attribution(p_org,p_type,p_id,p_event,jsonb_build_object('origin_id',p_origin,'campaign_id',p_campaign,'status','matched'),v_channel,p_reason,true);
END $$;

-- Checked, paginated preview. Apply requires the exact decision shown in preview.
CREATE FUNCTION public.commercial_backfill(p_org uuid,p_from timestamptz,p_to timestamptz,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT commercial_has_permission(p_org,'can_manage_settings') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('total',count(*),'items',COALESCE((SELECT jsonb_agg(x) FROM (
  SELECT e.id,e.occurred_at,e.contact_id,e.opportunity_id,e.entry_verified,e.first_contact_entry,e.text_content,e.process_error,
   commercial_resolve_event(e.id) decision,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('entity_type',a.entity_type,'entity_id',a.entity_id,'revision',a.revision,'origin_id',a.origin_id,'method',a.method) ORDER BY a.entity_type)
    FROM commercial_attributions a WHERE a.organization_id=p_org AND ((a.entity_type='contact' AND a.entity_id=e.contact_id AND e.first_contact_entry) OR (a.entity_type='opportunity' AND a.entity_id=e.opportunity_id))),'[]') revisions
  FROM commercial_origin_events e WHERE e.organization_id=p_org AND e.occurred_at>=p_from AND e.occurred_at<p_to
    AND commercial_can_read(p_org,'contact',e.contact_id) AND (e.opportunity_id IS NULL OR commercial_can_read(p_org,'opportunity',e.opportunity_id))
  ORDER BY e.occurred_at,e.id LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0)
 ) x),'[]')) INTO result FROM commercial_origin_events e WHERE e.organization_id=p_org AND e.occurred_at>=p_from AND e.occurred_at<p_to
 AND commercial_can_read(p_org,'contact',e.contact_id) AND (e.opportunity_id IS NULL OR commercial_can_read(p_org,'opportunity',e.opportunity_id));
 RETURN result;
END $$;
CREATE FUNCTION public.commercial_apply_preview(p_org uuid,p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; e commercial_origin_events; r jsonb; revisions jsonb; updated int:=0; skipped int:=0;
BEGIN
 IF NOT commercial_has_permission(p_org,'can_manage_settings') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||':commercial-config',0));
 IF jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'Maximum 100 entries per batch'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO e FROM commercial_origin_events WHERE id=(item->>'id')::uuid AND organization_id=p_org FOR UPDATE;
  IF NOT FOUND OR NOT commercial_can_read(p_org,'contact',e.contact_id) OR (e.opportunity_id IS NOT NULL AND NOT commercial_can_read(p_org,'opportunity',e.opportunity_id)) THEN skipped:=skipped+1; CONTINUE; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity_type',a.entity_type,'entity_id',a.entity_id,'revision',a.revision,'origin_id',a.origin_id,'method',a.method) ORDER BY a.entity_type),'[]') INTO revisions
   FROM commercial_attributions a WHERE a.organization_id=p_org AND ((a.entity_type='contact' AND a.entity_id=e.contact_id AND e.first_contact_entry) OR (a.entity_type='opportunity' AND a.entity_id=e.opportunity_id));
  r:=commercial_resolve_event(e.id);
  IF r IS DISTINCT FROM item->'decision' OR revisions IS DISTINCT FROM item->'revisions' OR NOT e.entry_verified OR r->>'status'<>'matched' THEN skipped:=skipped+1; CONTINUE; END IF;
  r:=commercial_process_event(e.id); updated:=updated+COALESCE((r->>'updated')::int,0);
 END LOOP;
 RETURN jsonb_build_object('updated',updated,'skipped',skipped);
END $$;

-- Legacy rows are read only. Import retains uncertainty; no guessing by timestamp.
CREATE FUNCTION public.commercial_import_history(p_org uuid,p_from timestamptz,p_to timestamptz,p_limit integer DEFAULT 100,p_offset integer DEFAULT 0) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; o record; n int:=0; info jsonb; ref jsonb; v_id uuid;
BEGIN
 IF NOT commercial_has_permission(p_org,'can_manage_settings') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 FOR m IN SELECT message_row.*,t.contact_id FROM messages message_row JOIN message_threads t ON t.id=message_row.thread_id AND t.organization_id=message_row.organization_id
 WHERE message_row.organization_id=p_org AND message_row.direction='inbound' AND t.channel='whatsapp' AND message_row.created_at>=p_from AND message_row.created_at<p_to
  AND commercial_can_read(p_org,'contact',t.contact_id) ORDER BY message_row.created_at,message_row.id LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0)
 LOOP
  info:=COALESCE(m.metadata->'commercial_entry','{}');
  ref:=COALESCE(m.metadata#>'{meta_cloud,referral}',m.metadata#>'{twilio,commercial_referral}','{}');
  INSERT INTO commercial_origin_events(organization_id,external_key,contact_id,opportunity_id,message_id,endpoint_id,channel,occurred_at,first_contact_entry,entry_verified,text_content,evidence)
  VALUES(p_org,'message:'||m.id,m.contact_id,NULLIF(info->>'opportunity_id','')::uuid,m.id,m.endpoint_id,'whatsapp',m.created_at,
   COALESCE((info->>'first_contact_entry')::boolean,false),COALESCE((info->>'first_contact_entry')::boolean,false) OR NULLIF(info->>'opportunity_id','') IS NOT NULL,
   CASE WHEN m.media_type IS NULL AND (m.metadata#>>'{meta_cloud,raw,type}' IS NULL OR m.metadata#>>'{meta_cloud,raw,type}'='text') THEN m.content END,
   jsonb_build_object('ctwa_clid',ref->>'ctwa_clid','source_type',ref->>'source_type','ad_id',ref->>'source_id','imported',true))
  ON CONFLICT(organization_id,external_key) DO NOTHING RETURNING id INTO v_id;
  n:=n+1;
 END LOOP;
 -- Only evidence stored on the opportunity itself. Never copy a contact's latest campaign.
 FOR o IN SELECT * FROM opportunities WHERE organization_id=p_org AND deleted_at IS NULL AND contact_id IS NOT NULL
  AND created_at>=p_from AND created_at<p_to AND commercial_can_read(p_org,'opportunity',id) AND commercial_can_read(p_org,'contact',contact_id)
  AND (source IN ('ctwa','meta_lead_ads','meta_ads','google_ads') OR NULLIF(utm_source,'') IS NOT NULL)
  ORDER BY created_at,id LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0)
 LOOP
  INSERT INTO commercial_origin_events(organization_id,external_key,contact_id,opportunity_id,channel,occurred_at,entry_verified,evidence)
  VALUES(p_org,'legacy-opportunity:'||o.id,o.contact_id,o.id,CASE WHEN o.source='ctwa' THEN 'whatsapp' ELSE 'legacy' END,o.created_at,true,
    jsonb_build_object('source',o.source,'utm_source',o.utm_source,'utm_medium',o.utm_medium,'utm_campaign',o.utm_campaign,'campaign_id',o.marketing_campaign_id,'legacy_opportunity',true))
  ON CONFLICT(organization_id,external_key) DO NOTHING;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;

-- Explicit allowlist: internal SECURITY DEFINER helpers must never be client callable.
REVOKE ALL ON FUNCTION public.commercial_message_capture(),public.commercial_validate_tenant() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.commercial_configure(uuid,text,jsonb),public.commercial_correct(uuid,text,uuid,uuid,uuid,text,uuid),
 public.commercial_backfill(uuid,timestamptz,timestamptz,integer,integer),public.commercial_apply_preview(uuid,jsonb),
 public.commercial_import_history(uuid,timestamptz,timestamptz,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commercial_configure(uuid,text,jsonb),public.commercial_correct(uuid,text,uuid,uuid,uuid,text,uuid),
 public.commercial_backfill(uuid,timestamptz,timestamptz,integer,integer),public.commercial_apply_preview(uuid,jsonb),
 public.commercial_import_history(uuid,timestamptz,timestamptz,integer,integer) TO authenticated;

-- Preserve existing hard-delete workflows: remove sidecar rows before FK cleanup.
CREATE FUNCTION public.commercial_entity_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE kind text:=CASE TG_TABLE_NAME WHEN 'contacts' THEN 'contact' ELSE 'opportunity' END;
BEGIN
 DELETE FROM commercial_attributions WHERE organization_id=OLD.organization_id AND entity_type=kind AND entity_id=OLD.id;
 DELETE FROM commercial_attribution_history WHERE organization_id=OLD.organization_id AND entity_type=kind AND entity_id=OLD.id;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.commercial_entity_delete() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER commercial_contact_delete BEFORE DELETE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.commercial_entity_delete();
CREATE TRIGGER commercial_opportunity_delete BEFORE DELETE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.commercial_entity_delete();
