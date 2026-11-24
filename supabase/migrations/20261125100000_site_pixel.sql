-- Pixel do Seialz (fase 3 da unificação de origens).
-- Um script no site do cliente grava as visitas com pista de origem (UTM, clique
-- de anúncio, site de onde veio). Cada visita tem um código curto que o script
-- põe no formulário e na mensagem de WhatsApp ([sz:CODIGO]); assim o lead que
-- chega pelo WhatsApp herda a origem da visita ao site.
BEGIN;

CREATE TABLE public.site_pixels (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  public_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_pixels ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_pixels_select ON public.site_pixels FOR SELECT TO authenticated
  USING (organization_id = ANY(public.current_user_org_ids()));
REVOKE INSERT, UPDATE, DELETE ON public.site_pixels FROM anon, authenticated;

-- Só pistas de origem: sem IP, sem navegador, endereço sem os outros parâmetros.
CREATE TABLE public.site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  ref_code text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  page_host text,
  landing_url text,
  referrer_host text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  linked_at timestamptz,
  UNIQUE (organization_id, ref_code)
);
CREATE INDEX site_visits_visitor_idx ON public.site_visits (organization_id, visitor_id, occurred_at DESC);
CREATE INDEX site_visits_recent_idx ON public.site_visits (organization_id, occurred_at DESC);
CREATE INDEX site_visits_contact_idx ON public.site_visits (contact_id) WHERE contact_id IS NOT NULL;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_visits_select ON public.site_visits FOR SELECT TO authenticated
  USING (organization_id = ANY(public.current_user_org_ids()));
REVOKE INSERT, UPDATE, DELETE ON public.site_visits FROM anon, authenticated;

-- Grava a visita e devolve o código. Mesma visita em 30 min = mesmo código;
-- teto de 50 visitas por visitante por dia contra abuso da chave pública.
CREATE OR REPLACE FUNCTION public.site_pixel_record_visit(p_key text, p_visitor text, p_page_host text,
  p_landing text, p_referrer_host text, p_evidence jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_code text; v_n int; v_try int := 0;
 c_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
BEGIN
 SELECT organization_id INTO v_org FROM site_pixels WHERE public_key = p_key;
 IF v_org IS NULL THEN RETURN NULL; END IF;
 SELECT ref_code INTO v_code FROM site_visits
  WHERE organization_id = v_org AND visitor_id = p_visitor AND occurred_at > now() - interval '30 minutes'
    AND evidence - 'landing_url' = COALESCE(p_evidence, '{}'::jsonb) - 'landing_url'
  ORDER BY occurred_at DESC LIMIT 1;
 IF v_code IS NOT NULL THEN RETURN v_code; END IF;
 SELECT count(*) INTO v_n FROM site_visits
  WHERE organization_id = v_org AND visitor_id = p_visitor AND occurred_at > now() - interval '1 day';
 IF v_n >= 50 THEN
  SELECT ref_code INTO v_code FROM site_visits WHERE organization_id = v_org AND visitor_id = p_visitor
   ORDER BY occurred_at DESC LIMIT 1;
  RETURN v_code;
 END IF;
 LOOP
  v_try := v_try + 1;
  SELECT string_agg(substr(c_alpha, 1 + floor(random() * length(c_alpha))::int, 1), '') INTO v_code FROM generate_series(1, 8);
  BEGIN
   INSERT INTO site_visits (organization_id, visitor_id, ref_code, page_host, landing_url, referrer_host, evidence)
   VALUES (v_org, p_visitor, v_code, left(p_page_host, 255), left(p_landing, 1000), left(p_referrer_host, 255), COALESCE(p_evidence, '{}'::jsonb));
   RETURN v_code;
  EXCEPTION WHEN unique_violation THEN
   IF v_try >= 5 THEN RAISE; END IF;
  END;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.site_pixel_record_visit(text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_pixel_record_visit(text, text, text, text, text, jsonb) TO service_role;

-- Tela Marketing > Pixel: cria a chave na primeira abertura e mostra o que chegou.
CREATE OR REPLACE FUNCTION public.rpc_site_pixel_v1(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text;
BEGIN
 IF NOT (p_org = ANY(current_user_org_ids())) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
 INSERT INTO site_pixels (organization_id, public_key)
 VALUES (p_org, 'px_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20))
 ON CONFLICT (organization_id) DO NOTHING;
 SELECT public_key INTO v_key FROM site_pixels WHERE organization_id = p_org;
 RETURN jsonb_build_object(
  'key', v_key,
  'visits_24h', (SELECT count(*) FROM site_visits WHERE organization_id = p_org AND occurred_at > now() - interval '1 day'),
  'visits_7d', (SELECT count(*) FROM site_visits WHERE organization_id = p_org AND occurred_at > now() - interval '7 days'),
  'linked_30d', (SELECT count(DISTINCT contact_id) FROM site_visits WHERE organization_id = p_org AND contact_id IS NOT NULL AND linked_at > now() - interval '30 days'),
  'last_visit_at', (SELECT max(occurred_at) FROM site_visits WHERE organization_id = p_org),
  'hosts', COALESCE((SELECT jsonb_agg(jsonb_build_object('host', page_host, 'visits', n) ORDER BY n DESC)
     FROM (SELECT page_host, count(*) n FROM site_visits WHERE organization_id = p_org AND occurred_at > now() - interval '30 days'
           GROUP BY page_host ORDER BY count(*) DESC LIMIT 5) h), '[]'::jsonb),
  'recent', COALESCE((SELECT jsonb_agg(r ORDER BY (r->>'at') DESC) FROM (
     SELECT jsonb_build_object('at', occurred_at, 'host', page_host, 'referrer', referrer_host,
       'utm_source', evidence->>'utm_source', 'utm_medium', evidence->>'utm_medium', 'utm_campaign', evidence->>'utm_campaign',
       'click', CASE WHEN evidence ? 'gclid' OR evidence ? 'gbraid' OR evidence ? 'wbraid' THEN 'google'
                     WHEN evidence ? 'fbclid' THEN 'meta' END,
       'direct', evidence->>'site_entry' = 'direct', 'linked', contact_id IS NOT NULL) r
     FROM site_visits WHERE organization_id = p_org ORDER BY occurred_at DESC LIMIT 10) x), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.rpc_site_pixel_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_site_pixel_v1(uuid) TO authenticated;

-- Liga o formulário ao contato quando ele traz o código da visita.
CREATE OR REPLACE FUNCTION public.site_pixel_link_visit(p_org uuid, p_code text, p_contact uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 UPDATE site_visits SET contact_id = p_contact, linked_at = now()
  WHERE organization_id = p_org AND ref_code = upper(p_code) AND contact_id IS NULL;
$$;
REVOKE ALL ON FUNCTION public.site_pixel_link_visit(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_pixel_link_visit(uuid, text, uuid) TO service_role;

-- WhatsApp: mensagem com [sz:CODIGO] herda as pistas da visita ao site.
-- O que veio do próprio WhatsApp (anúncio de clique para conversa) continua valendo mais.
CREATE OR REPLACE FUNCTION public.commercial_message_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_contact uuid; v_info jsonb; v_ref jsonb; v_evidence jsonb; v_opp uuid; v_first boolean; v_text text; v_visit site_visits%ROWTYPE;
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
 IF v_text ~ '\[sz:[A-Za-z0-9]{8}\]' THEN
  SELECT * INTO v_visit FROM site_visits
   WHERE organization_id=NEW.organization_id AND ref_code=upper(substring(v_text from '\[sz:([A-Za-z0-9]{8})\]'));
  IF FOUND THEN
   v_evidence:=v_visit.evidence||jsonb_build_object('site_visit_id',v_visit.id)||v_evidence;
   UPDATE site_visits SET contact_id=v_contact, linked_at=now() WHERE id=v_visit.id AND contact_id IS NULL;
  END IF;
 END IF;
 PERFORM commercial_capture(NEW.organization_id,'message:'||NEW.id,v_contact,v_opp,'whatsapp',NEW.created_at,v_first,v_first OR v_opp IS NOT NULL,
   v_evidence,NEW.id,NEW.endpoint_id,v_text);
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'commercial_capture_failed message=% state=% error=%',NEW.id,SQLSTATE,SQLERRM;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.commercial_resolve_event(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
 -- Pixel do Seialz: entrou no site sem anúncio, link marcado nem site de origem.
 ELSIF e.entry_verified AND (lower(v_marker)='direct' OR e.evidence->>'site_entry'='direct') THEN v_code:='direct'; END IF;
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
END $function$;

-- Visita que nunca virou contato some depois de 13 meses.
SELECT cron.schedule('site-visits-retention', '17 4 * * *',
  $$DELETE FROM public.site_visits WHERE contact_id IS NULL AND occurred_at < now() - interval '13 months'$$);

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261125100000', 'site_pixel') ON CONFLICT DO NOTHING;
COMMIT;
