-- Origens, passo 1b: motor completo antes de ligar para todas as orgs.
-- * Valores automáticos da Meta (fb, ig, an, th, msg) e IDs de anúncio contam como Meta Ads.
-- * Variável de link não preenchida ({{...}}) vale como vazio.
-- * Novas origens padrão: Social orgânico e E-mail; Google orgânico também pelo site de origem.
-- * Campanha: desempata pelo nome do anúncio/conjunto e usa a campanha já ligada pelo sistema antigo.
-- * Contato sem evidência na conversa usa as próprias colunas de atribuição (primeiro toque).
-- * Oportunidade sem evidência própria herda a origem do contato (method='inherited'); evidência direta substitui.

ALTER TABLE public.commercial_attributions DROP CONSTRAINT commercial_attributions_method_check;
ALTER TABLE public.commercial_attributions ADD CONSTRAINT commercial_attributions_method_check
 CHECK (method IN ('direct','message_rule','manual','migrated','inherited','unknown'));

INSERT INTO public.commercial_origins(organization_id,code,name)
SELECT DISTINCT o.organization_id,x.code,x.name FROM public.commercial_origins o
CROSS JOIN (VALUES ('social_organic','Social orgânico'),('email','E-mail')) x(code,name)
ON CONFLICT(organization_id,code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.commercial_clean(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN p IS NULL OR btrim(p)='' OR p LIKE '%{{%' THEN NULL ELSE btrim(p) END;
$$;
REVOKE ALL ON FUNCTION public.commercial_clean(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.commercial_resolve_event(p_event uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e commercial_origin_events; v_code text; v_origin uuid; v_campaign uuid; v_count int; v_meta boolean; v_google boolean;
 v_result jsonb; v_marker text; v_us text; v_um text; v_src text; v_ref text; v_legacy_platform text;
 c_paid text[]:=ARRAY['cpc','ppc','paid','display','paid_social','paidsocial','ctwa','paid-social','ads'];
 c_organic text[]:=ARRAY['organic','organico','orgânico','social','bio','post','story','stories','profile','perfil','linktree','referral'];
BEGIN
 SELECT * INTO STRICT e FROM commercial_origin_events WHERE id=p_event;
 v_marker:=substring(e.text_content from '\[src:([^|\]]+)');
 v_us:=lower(commercial_clean(e.evidence->>'utm_source'));
 v_um:=lower(commercial_clean(e.evidence->>'utm_medium'));
 v_src:=lower(commercial_clean(e.evidence->>'source'));
 v_ref:=substring(lower(commercial_clean(e.evidence->>'referrer_url')) from '^[a-z]+://([^/:?#]+)');
 -- Campaign the legacy resolver already linked to this contact: platform is a strong hint.
 IF commercial_clean(e.evidence->>'legacy_campaign_id') IS NOT NULL THEN
  SELECT lower(platform) INTO v_legacy_platform FROM marketing_campaigns
   WHERE id=(e.evidence->>'legacy_campaign_id')::uuid AND organization_id=e.organization_id AND deleted_at IS NULL;
 END IF;
 v_meta:=commercial_clean(e.evidence->>'ctwa_clid') IS NOT NULL
  OR e.evidence->>'source_type' IN ('ad','lead_ad','lead_form')
  OR v_src IN ('ctwa','meta_lead_ads','meta_ads')
  OR (e.entry_verified AND e.channel='form' AND v_src='meta' AND coalesce(v_um,'') <> ALL(c_organic))
  OR (v_us IN ('meta','meta_ads','facebook','instagram','fb','ig') AND v_um = ANY(c_paid))
  -- {{site_source_name}} da Meta: só aparece em link de anúncio.
  OR (v_us IN ('fb','ig','an','th','msg') AND coalesce(v_um,'') <> ALL(c_organic))
  OR commercial_clean(e.evidence->>'meta_ad_id') IS NOT NULL OR commercial_clean(e.evidence->>'meta_adset_id') IS NOT NULL
  OR commercial_clean(e.evidence->>'meta_campaign_id') IS NOT NULL
  OR v_legacy_platform IN ('meta','facebook','meta_ads');
 v_google:=commercial_clean(e.evidence->>'gclid') IS NOT NULL OR commercial_clean(e.evidence->>'gbraid') IS NOT NULL
  OR commercial_clean(e.evidence->>'wbraid') IS NOT NULL OR v_src IN ('google_ads','gads')
  OR (v_us='google' AND v_um IN ('cpc','ppc','paid','display'))
  OR (e.entry_verified AND lower(v_marker)='gads')
  OR v_legacy_platform IN ('google','google_ads');
 IF COALESCE(v_meta,false) AND COALESCE(v_google,false) THEN RETURN '{"status":"conflict","method":"unknown","reason":"direct_evidence_conflict"}'; END IF;
 IF v_meta THEN v_code:='meta_ads';
 ELSIF v_google THEN v_code:='google_ads';
 ELSIF v_um IN ('email','e-mail','newsletter') OR v_src='email' THEN v_code:='email';
 ELSIF v_um IN ('indicacao','indicação','referral_program','mgm') OR v_src IN ('indicacao','indicação') THEN v_code:='referral';
 ELSIF v_us='google' AND v_um='organic' THEN v_code:='google_organic';
 ELSIF v_um = ANY(c_paid) THEN v_code:='paid_other';
 ELSIF v_us IN ('facebook','instagram','fb','ig','tiktok','linkedin','youtube','twitter','x','threads','pinterest') THEN v_code:='social_organic';
 ELSIF v_us IS NULL AND v_ref ~ '(^|\.)google\.[a-z.]+$' THEN v_code:='google_organic';
 ELSIF v_us IS NULL AND v_ref ~ '(^|\.)(facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com|t\.co|threads\.net)$' THEN v_code:='social_organic';
 ELSIF e.entry_verified AND lower(v_marker)='direct' THEN v_code:='direct'; END IF;
 IF v_code IS NOT NULL THEN
   SELECT id INTO v_origin FROM commercial_origins WHERE organization_id=e.organization_id AND code=v_code;
   -- Never derive campaign from a stale contact or a click ID alone.
   WITH candidates AS (
    SELECT m.id, CASE
     WHEN nullif(e.evidence->>'ad_id','') IS NOT NULL AND (m.ad_id=e.evidence->>'ad_id' OR m.external_id=e.evidence->>'ad_id') THEN 1
     WHEN nullif(e.evidence->>'campaign_id','') IS NOT NULL AND m.id::text=e.evidence->>'campaign_id' THEN 1
     WHEN commercial_clean(e.evidence->>'meta_ad_id') IS NOT NULL AND (m.ad_id=e.evidence->>'meta_ad_id' OR m.external_id=e.evidence->>'meta_ad_id') THEN 1
     WHEN nullif(e.evidence->>'meta_adset_id','') IS NOT NULL AND m.adset_id=e.evidence->>'meta_adset_id' THEN 2
     WHEN nullif(e.evidence->>'meta_campaign_id','') IS NOT NULL AND m.campaign_id=e.evidence->>'meta_campaign_id' THEN 3
     WHEN commercial_clean(e.evidence->>'utm_campaign') IS NOT NULL AND (m.campaign_id=e.evidence->>'utm_campaign' OR m.campaign_name=e.evidence->>'utm_campaign' OR m.external_id=e.evidence->>'utm_campaign') THEN 4
     WHEN m.id::text=e.evidence->>'legacy_campaign_id' THEN 5
    END AS priority,
    -- Desempate: nome do anúncio ou do conjunto que veio no link.
    (m.ad_name IS NOT NULL AND m.ad_name=commercial_clean(e.evidence->>'utm_content'))
     OR (m.adset_name IS NOT NULL AND m.adset_name IN (commercial_clean(e.evidence->>'utm_medium'),commercial_clean(e.evidence->>'utm_term')))
     OR m.id::text=e.evidence->>'legacy_campaign_id' AS fine
    FROM marketing_campaigns m
    WHERE m.organization_id=e.organization_id AND m.deleted_at IS NULL
     AND ((v_code='meta_ads' AND lower(m.platform) IN ('meta','facebook','meta_ads')) OR (v_code='google_ads' AND lower(m.platform) IN ('google','google_ads')))
   ), best AS (SELECT * FROM candidates WHERE priority=(SELECT min(priority) FROM candidates)),
   narrowed AS (SELECT * FROM best WHERE fine OR NOT EXISTS(SELECT 1 FROM best WHERE fine))
   SELECT count(*),(array_agg(id))[1] INTO v_count,v_campaign FROM narrowed;
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

REVOKE ALL ON FUNCTION public.commercial_resolve_event(uuid) FROM PUBLIC,anon,authenticated;

-- Oportunidades do contato sem origem própria recebem a do contato. Nunca toca manual nem evidência própria.
CREATE OR REPLACE FUNCTION public.commercial_inherit_contact_opportunities(p_org uuid,p_contact uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ca commercial_attributions; o record; n integer:=0;
BEGIN
 SELECT * INTO ca FROM commercial_attributions WHERE organization_id=p_org AND entity_type='contact' AND entity_id=p_contact;
 IF ca.id IS NULL OR ca.origin_id IS NULL THEN RETURN 0; END IF;
 FOR o IN SELECT p.id FROM opportunities p
   LEFT JOIN commercial_attributions a ON a.organization_id=p_org AND a.entity_type='opportunity' AND a.entity_id=p.id
   WHERE p.organization_id=p_org AND p.contact_id=p_contact AND p.deleted_at IS NULL
     AND (a.id IS NULL OR (a.method<>'manual' AND (a.origin_id IS NULL OR a.method='inherited')))
     AND (a.id IS NULL OR a.method<>'inherited' OR a.origin_id IS DISTINCT FROM ca.origin_id OR a.campaign_id IS DISTINCT FROM ca.campaign_id)
 LOOP
  IF commercial_write_attribution(p_org,'opportunity',o.id,ca.event_id,
     jsonb_build_object('status','matched','origin_id',ca.origin_id,'campaign_id',ca.campaign_id,'method','inherited','inherited_from','contact'),
     ca.channel,'Herdada do contato') THEN n:=n+1; END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.commercial_inherit_contact_opportunities(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.commercial_write_attribution(p_org uuid, p_type text, p_id uuid, p_event uuid, p_result jsonb, p_channel text, p_reason text, p_manual boolean DEFAULT false, p_enrich boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE old_row commercial_attributions; new_row commercial_attributions;
BEGIN
 -- Serialize per entity, including the not-yet-existing row case.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||p_type||p_id::text,0));
 SELECT * INTO old_row FROM commercial_attributions WHERE organization_id=p_org AND entity_type=p_type AND entity_id=p_id FOR UPDATE;
 IF NOT p_manual AND old_row.id IS NOT NULL THEN
  IF old_row.method='manual' THEN RETURN false; END IF;
  IF old_row.method<>'inherited' AND old_row.origin_id IS NOT NULL AND NOT COALESCE((p_enrich AND old_row.event_id=p_event AND
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
 IF p_type='contact' AND COALESCE(p_result->>'method','')<>'inherited' THEN
  PERFORM commercial_inherit_contact_opportunities(p_org,p_id);
 END IF;
 RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.commercial_write_attribution(uuid,text,uuid,uuid,jsonb,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.commercial_recover_contact(p_org uuid, p_contact uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c contacts; m messages; o opportunities; e commercial_origin_events;
 v_evidence jsonb:='{}'; v_text text; v_endpoint uuid; v_message uuid; v_at timestamptz;
 v_initial boolean:=false; v_cols jsonb; v_opp uuid; v_count integer; v_id uuid; r jsonb; n integer:=0;
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
 -- Contact attribution columns (first touch written at creation) fill keys the stronger evidence lacks.
 v_cols:=jsonb_strip_nulls(jsonb_build_object('source',commercial_clean(c.source),'utm_source',commercial_clean(c.utm_source),
  'utm_medium',commercial_clean(c.utm_medium),'utm_campaign',commercial_clean(c.utm_campaign),'utm_content',commercial_clean(c.utm_content),
  'utm_term',commercial_clean(c.utm_term),'fbclid',commercial_clean(c.fbclid),'gclid',commercial_clean(c.gclid),
  'meta_ad_id',commercial_clean(c.meta_ad_id),'meta_adset_id',commercial_clean(c.meta_adset_id),'meta_campaign_id',commercial_clean(c.meta_campaign_id),
  'referrer_url',commercial_clean(c.referrer_url),'landing_url',commercial_clean(c.landing_url),'legacy_campaign_id',c.marketing_campaign_id::text));
 IF v_cols - 'source' <> '{}'::jsonb OR v_initial THEN
  v_evidence:=v_cols||v_evidence;
  IF NOT v_initial THEN v_initial:=true; v_at:=c.created_at; v_evidence:=v_evidence||'{"contact_columns":true}'; END IF;
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
  ON CONFLICT(organization_id,external_key) DO UPDATE SET evidence=jsonb_strip_nulls(EXCLUDED.evidence)||commercial_origin_events.evidence;
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
 PERFORM commercial_inherit_contact_opportunities(p_org,c.id);
 RETURN n;
END $function$;

REVOKE ALL ON FUNCTION public.commercial_recover_contact(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.commercial_configure(p_org uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_result jsonb;
BEGIN
 IF NOT commercial_has_permission(p_org,'can_manage_settings') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||':commercial-config',0));
 IF p_action='enable' THEN
   INSERT INTO commercial_origins(organization_id,code,name)
   SELECT p_org,x.code,x.name FROM (VALUES ('meta_ads','Meta Ads'),('google_ads','Google Ads'),('google_organic','Google orgânico'),
    ('paid_other','Outros anúncios'),('referral','Indicação'),('partner','Parceiro'),('event','Evento'),('direct','Acesso direto'),
    ('social_organic','Social orgânico'),('email','E-mail')) x(code,name)
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
END $function$;


-- Oportunidade nova: herda na hora; a evidência que chegar depois (formulário, mensagem) substitui.
CREATE OR REPLACE FUNCTION public.commercial_opportunity_inherit_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.contact_id IS NOT NULL AND EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=NEW.organization_id AND enabled) THEN
  PERFORM commercial_inherit_contact_opportunities(NEW.organization_id,NEW.contact_id);
 END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'commercial_inherit_failed opportunity=% error=%',NEW.id,SQLERRM;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.commercial_opportunity_inherit_trigger() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS commercial_opportunity_inherit ON public.opportunities;
CREATE TRIGGER commercial_opportunity_inherit AFTER INSERT ON public.opportunities
 FOR EACH ROW EXECUTE FUNCTION public.commercial_opportunity_inherit_trigger();
