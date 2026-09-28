-- Full-schema integration suite. Uses only synthetic organizations, existing user identities,
-- and ROLLBACK. Does not redefine auth helpers or disable production triggers/RLS.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';
CREATE FUNCTION pg_temp.check(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE TEMP TABLE qa_ids(k text PRIMARY KEY,id uuid NOT NULL);
INSERT INTO qa_ids VALUES ('org',gen_random_uuid()),('other',gen_random_uuid()),('contact',gen_random_uuid()),('foreign_contact',gen_random_uuid()),('opp1',gen_random_uuid()),('opp2',gen_random_uuid()),('opp3',gen_random_uuid()),('stage',gen_random_uuid()),('endpoint',gen_random_uuid()),('foreign_endpoint',gen_random_uuid()),('thread',gen_random_uuid()),('message',gen_random_uuid()),('profile',gen_random_uuid()),('limited_profile',gen_random_uuid());
INSERT INTO qa_ids SELECT 'actor',id FROM users WHERE auth_user_id IS NOT NULL ORDER BY created_at LIMIT 1;
INSERT INTO qa_ids SELECT 'limited',id FROM users WHERE auth_user_id IS NOT NULL AND id<>(SELECT id FROM qa_ids WHERE k='actor') ORDER BY created_at LIMIT 1;
CREATE FUNCTION pg_temp.qa(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM qa_ids WHERE qa_ids.k=$1 $$;
SELECT pg_temp.check((SELECT count(*)=16 FROM qa_ids),'two existing user identities available');
INSERT INTO organizations(id,name,slug,private_records_enabled) SELECT id,'QA commercial rollback', 'qa-commercial-'||id,true FROM qa_ids WHERE k IN ('org','other');
INSERT INTO permission_profiles(id,organization_id,name,permissions) VALUES
 (pg_temp.qa('profile'),pg_temp.qa('org'),'QA admin','{"can_manage_settings":true,"can_view_contacts":true,"can_edit_contacts":true,"can_view_opportunities":true,"can_edit_opportunities":true,"view_all_contacts":true,"view_all_opportunities":true}'),
 (pg_temp.qa('limited_profile'),pg_temp.qa('org'),'QA limited','{"can_view_contacts":true,"can_view_opportunities":true}');
INSERT INTO user_organizations(user_id,organization_id,permission_profile_id,is_active) VALUES
 (pg_temp.qa('actor'),pg_temp.qa('org'),pg_temp.qa('profile'),true),
 (pg_temp.qa('limited'),pg_temp.qa('org'),pg_temp.qa('limited_profile'),true);
SELECT set_config('request.jwt.claim.sub',(SELECT auth_user_id::text FROM users WHERE id=pg_temp.qa('actor')),true);
SELECT pg_temp.check(current_user_id()=pg_temp.qa('actor'),'real auth mapping');
SELECT commercial_configure(pg_temp.qa('org'),'enable','{"enabled":true}');
INSERT INTO communication_endpoints(id,organization_id,channel,display_name,external_address,provider,status) VALUES
 (pg_temp.qa('endpoint'),pg_temp.qa('org'),'whatsapp','QA offline','qa-commercial-endpoint','other','disabled'),
 (pg_temp.qa('foreign_endpoint'),pg_temp.qa('other'),'whatsapp','QA other','qa-commercial-other','other','disabled');
INSERT INTO contacts(id,organization_id,full_name,source,owner_user_id) VALUES
 (pg_temp.qa('contact'),pg_temp.qa('org'),'QA commercial rollback','manual',pg_temp.qa('actor')),
 (pg_temp.qa('foreign_contact'),pg_temp.qa('other'),'QA foreign rollback','manual',NULL);
INSERT INTO pipeline_stages(id,organization_id,name,type,order_index) VALUES(pg_temp.qa('stage'),pg_temp.qa('org'),'QA open','custom',1);
INSERT INTO opportunities(id,organization_id,contact_id,title,pipeline_stage_id,owner_user_id,amount,currency,source)
 SELECT id,pg_temp.qa('org'),pg_temp.qa('contact'),'QA '||k,pg_temp.qa('stage'),pg_temp.qa('actor'),CASE k WHEN 'opp1' THEN 100 ELSE 20 END,CASE k WHEN 'opp3' THEN 'USD' ELSE 'BRL' END,'manual'
 FROM qa_ids WHERE k IN ('opp1','opp2','opp3');
CREATE TEMP TABLE qa_baseline AS
 SELECT 'contact' AS kind,to_jsonb(c) AS data FROM contacts c WHERE id=pg_temp.qa('contact') UNION ALL
 SELECT 'opportunity',to_jsonb(o) FROM opportunities o WHERE organization_id=pg_temp.qa('org');
SELECT commercial_configure(pg_temp.qa('org'),'rule',jsonb_build_object('name','QA exact','operator','exact','pattern','QA Olá, Google!','origin_id',(SELECT id FROM commercial_origins WHERE organization_id=pg_temp.qa('org') AND code='google_ads'),'endpoint_id',pg_temp.qa('endpoint')));
SELECT commercial_configure(pg_temp.qa('org'),'rule',jsonb_build_object('name','QA contains','operator','contains','pattern','Google','priority',0,'origin_id',(SELECT id FROM commercial_origins WHERE organization_id=pg_temp.qa('org') AND code='meta_ads')));
SELECT pg_temp.check(commercial_match_message(pg_temp.qa('org'),'  QA OLÁ, Google!  ',pg_temp.qa('endpoint'))->>'origin_id'=(SELECT id::text FROM commercial_origins WHERE organization_id=pg_temp.qa('org') AND code='google_ads'),'exact beats contains and normalizes spaces/case');
SELECT pg_temp.check(commercial_match_message(pg_temp.qa('other'),'QA Olá, Google!',pg_temp.qa('endpoint'))->>'status'='unknown','tenant rule isolation');
SELECT pg_temp.check(commercial_match_message(pg_temp.qa('org'),'QA Olá, Google!',NULL)->>'origin_id'=(SELECT id::text FROM commercial_origins WHERE organization_id=pg_temp.qa('org') AND code='meta_ads'),'endpoint-specific rule does not apply globally');
SELECT commercial_capture(pg_temp.qa('org'),'qa-first',pg_temp.qa('contact'),pg_temp.qa('opp1'),'whatsapp',now(),true,true,'{"ctwa_clid":"qa-meta"}',NULL,pg_temp.qa('endpoint'),'QA Olá, Google!');
SELECT commercial_capture(pg_temp.qa('org'),'qa-second',pg_temp.qa('contact'),pg_temp.qa('opp2'),'whatsapp',now(),false,true,'{}',NULL,pg_temp.qa('endpoint'),'QA Olá, Google!');
SELECT pg_temp.check((SELECT a.method='direct' AND s.code='meta_ads' FROM commercial_attributions a JOIN commercial_origins s ON s.id=a.origin_id WHERE a.entity_id=pg_temp.qa('contact')),'CTWA preserves first contact origin');
SELECT pg_temp.check((SELECT a.method='message_rule' AND s.code='google_ads' FROM commercial_attributions a JOIN commercial_origins s ON s.id=a.origin_id WHERE a.entity_id=pg_temp.qa('opp2')),'opportunity has independent message origin');
SELECT commercial_capture(pg_temp.qa('org'),'qa-second',pg_temp.qa('contact'),pg_temp.qa('opp2'),'whatsapp',now(),false,true,'{}',NULL,pg_temp.qa('endpoint'),'QA Olá, Google!');
SELECT pg_temp.check((SELECT count(*)=2 FROM commercial_origin_events WHERE organization_id=pg_temp.qa('org')),'capture idempotent');
SELECT commercial_correct(pg_temp.qa('org'),'opportunity',pg_temp.qa('opp2'),(SELECT id FROM commercial_origins WHERE organization_id=pg_temp.qa('org') AND code='referral'),NULL,'QA manual protection');
SELECT commercial_process_event((SELECT id FROM commercial_origin_events WHERE organization_id=pg_temp.qa('org') AND external_key='qa-second'));
SELECT pg_temp.check((SELECT method='manual' FROM commercial_attributions WHERE entity_id=pg_temp.qa('opp2')),'manual correction protected');
SELECT commercial_capture(pg_temp.qa('org'),'qa-unknown',pg_temp.qa('contact'),pg_temp.qa('opp3'),'whatsapp',now(),false,true,'{}',NULL,NULL,'QA late exclusive');
SELECT commercial_configure(pg_temp.qa('org'),'rule',jsonb_build_object('name','QA late','operator','exact','pattern','QA late exclusive','origin_id',(SELECT id FROM commercial_origins WHERE organization_id=pg_temp.qa('org') AND code='google_ads')));
DO $$ DECLARE preview jsonb; r jsonb; BEGIN
 SELECT x INTO preview FROM jsonb_array_elements(commercial_backfill(pg_temp.qa('org'),now()-interval '1 hour',now()+interval '1 hour')->'items') x WHERE x->>'opportunity_id'=pg_temp.qa('opp3')::text;
 PERFORM pg_temp.check((SELECT origin_id IS NULL FROM commercial_attributions WHERE entity_id=pg_temp.qa('opp3')),'preview read-only');
 UPDATE commercial_message_rules SET priority=102 WHERE organization_id=pg_temp.qa('org') AND name='QA late';
 r:=commercial_apply_preview(pg_temp.qa('org'),jsonb_build_array(preview));
 PERFORM pg_temp.check(r->>'updated'='0' AND r->>'skipped'='1','stale preview skipped');
 SELECT x INTO preview FROM jsonb_array_elements(commercial_backfill(pg_temp.qa('org'),now()-interval '1 hour',now()+interval '1 hour')->'items') x WHERE x->>'opportunity_id'=pg_temp.qa('opp3')::text;
 r:=commercial_apply_preview(pg_temp.qa('org'),jsonb_build_array(preview));
 PERFORM pg_temp.check(r->>'updated'='1','fresh preview applies');
 PERFORM pg_temp.check(commercial_apply_preview(pg_temp.qa('org'),jsonb_build_array(preview))->>'updated'='0','preview idempotent');
END $$;
SELECT pg_temp.check((commercial_records(pg_temp.qa('org'),'opportunity','{}',1,0,true)->>'total')::int=3,'server count before page');
SELECT pg_temp.check(jsonb_array_length(commercial_records(pg_temp.qa('org'),'opportunity','{}',1,1,false)->'items')=1,'server second page');
SELECT pg_temp.check((commercial_records(pg_temp.qa('org'),'opportunity','{"sort":"amount","sort_direction":"ascending"}',1,0,false)#>>'{items,0,amount}')::numeric=20,'numeric sorting');
SELECT pg_temp.check((commercial_report(pg_temp.qa('org'),'{"currency":"USD"}')->>'opportunities')::int=1,'currency report drilldown');
SELECT pg_temp.check(NOT EXISTS((SELECT kind,data FROM qa_baseline EXCEPT SELECT 'contact',to_jsonb(c) FROM contacts c WHERE id=pg_temp.qa('contact') EXCEPT SELECT 'opportunity',to_jsonb(o) FROM opportunities o WHERE organization_id=pg_temp.qa('org'))),'commercial actions preserve entire legacy contact/opportunity rows');
INSERT INTO message_threads(id,organization_id,contact_id,channel,business_context,primary_endpoint_id) VALUES(pg_temp.qa('thread'),pg_temp.qa('org'),pg_temp.qa('contact'),'whatsapp','sales',pg_temp.qa('endpoint'));
INSERT INTO messages(id,organization_id,thread_id,direction,content,endpoint_id,metadata) VALUES(pg_temp.qa('message'),pg_temp.qa('org'),pg_temp.qa('thread'),'inbound','QA Olá, Google!',pg_temp.qa('endpoint'),'{"commercial_entry":{"first_contact_entry":false}}');
SELECT pg_temp.check((SELECT result->>'status'='unlinked' AND process_error IS NULL FROM commercial_origin_events WHERE message_id=pg_temp.qa('message')),'real message triggers capture later message without reattributing');
SELECT commercial_capture(pg_temp.qa('org'),'qa-conflict',pg_temp.qa('contact'),NULL,'form',now(),false,true,'{"gclid":"qa-g","ctwa_clid":"qa-m"}');
SELECT pg_temp.check((SELECT result->>'status'='conflict' FROM commercial_origin_events WHERE organization_id=pg_temp.qa('org') AND external_key='qa-conflict'),'direct evidence conflict');
GRANT SELECT ON qa_ids TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check((SELECT count(*)=4 FROM commercial_attributions WHERE organization_id=pg_temp.qa('org')),'authenticated admin reads scoped attributions');
DO $$ BEGIN
 BEGIN PERFORM commercial_configure(pg_temp.qa('other'),'enable','{"enabled":true}'); RAISE EXCEPTION 'FAIL: cross tenant configure'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM commercial_match_message(pg_temp.qa('org'),'x',NULL); RAISE EXCEPTION 'FAIL: internal function exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT auth_user_id::text FROM users WHERE id=pg_temp.qa('limited')),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check((SELECT count(*)=0 FROM commercial_attributions WHERE organization_id=pg_temp.qa('org')),'limited user cannot read unowned origins');
SELECT pg_temp.check(commercial_report(pg_temp.qa('org'),'{}')->>'opportunities'='0','limited report contains no unowned opportunities');
RESET ROLE;
ROLLBACK;
SELECT 'commercial_full_schema_transaction_passed' AS result;
