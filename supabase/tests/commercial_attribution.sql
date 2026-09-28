-- Run against the disposable commercial_fixture.sql database. Transaction rolls back fixtures.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END$$;
INSERT INTO organizations VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO users VALUES('00000000-0000-0000-0000-000000000010','Admin'),('00000000-0000-0000-0000-000000000011','Rep');
INSERT INTO permission_profiles VALUES('00000000-0000-0000-0000-000000000020','{"can_manage_settings":true,"can_view_contacts":true,"can_edit_contacts":true,"can_view_opportunities":true,"can_edit_opportunities":true,"view_all_contacts":true,"view_all_opportunities":true}'),('00000000-0000-0000-0000-000000000021','{"can_view_contacts":true,"can_view_opportunities":true}');
INSERT INTO user_organizations VALUES('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001',true,'00000000-0000-0000-0000-000000000020'),('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001',true,'00000000-0000-0000-0000-000000000021');
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000010',true);
SELECT commercial_configure('00000000-0000-0000-0000-000000000001','enable','{"enabled":true}');
INSERT INTO communication_endpoints VALUES('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000001','whatsapp','Sales','5511999999999'),('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000002','whatsapp','Other','5511999999999');
INSERT INTO contacts(id,organization_id,full_name,phone,owner_user_id,source,utm_source,gclid,lifecycle_stage) VALUES
 ('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000001','Ana','5511888888888','00000000-0000-0000-0000-000000000010','ctwa','meta_ads','legacy-gclid','lead'),
 ('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000002','Other Ana','5511888888888',NULL,'whatsapp',NULL,NULL,'lead');
INSERT INTO pipeline_stages VALUES('00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000001','New','custom',1);
INSERT INTO opportunities(id,organization_id,contact_id,owner_user_id,title,status,amount,currency,pipeline_stage_id,source) VALUES
 ('00000000-0000-0000-0000-000000000060','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000010','First','open',100,'BRL','00000000-0000-0000-0000-000000000050','ctwa'),
 ('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000010','Second','won',500,'BRL','00000000-0000-0000-0000-000000000050','manual');
CREATE TEMP TABLE marketing_baseline AS SELECT 'contact' kind,to_jsonb(c) data FROM contacts c UNION ALL SELECT 'opportunity',to_jsonb(o) FROM opportunities o;
SELECT commercial_configure('00000000-0000-0000-0000-000000000001','rule',jsonb_build_object('name','Google exact','operator','exact','pattern','Olá, vim pelo Google!','priority',100,'origin_id',(SELECT id FROM commercial_origins WHERE code='google_ads')));
SELECT commercial_configure('00000000-0000-0000-0000-000000000001','rule',jsonb_build_object('name','Meta contains','operator','contains','pattern','Google','priority',0,'origin_id',(SELECT id FROM commercial_origins WHERE code='meta_ads')));
SELECT pg_temp.assert(commercial_normalize(E'  Ola\n  GOOGLE ' )='ola google','whitespace normalization');
SELECT pg_temp.assert(commercial_match_message('00000000-0000-0000-0000-000000000001','  Olá, vim pelo GOOGLE! ',NULL)->>'origin_id'=(SELECT id::text FROM commercial_origins WHERE code='google_ads'),'exact beats higher-priority contains');
SELECT pg_temp.assert(commercial_match_message('00000000-0000-0000-0000-000000000002','Olá, vim pelo Google!',NULL)->>'status'='unknown','rule tenant isolation');
SELECT pg_temp.assert(commercial_match_message('00000000-0000-0000-0000-000000000001','Olá, vim pelo google',NULL)->>'origin_id'=(SELECT id::text FROM commercial_origins WHERE code='meta_ads'),'punctuation preserved');
SELECT commercial_configure('00000000-0000-0000-0000-000000000001','rule',jsonb_build_object('name','conflicting','operator','exact','pattern','Olá, vim pelo Google!','priority',100,'origin_id',(SELECT id FROM commercial_origins WHERE code='meta_ads')));
SELECT pg_temp.assert(commercial_match_message('00000000-0000-0000-0000-000000000001','Olá, vim pelo Google!',NULL)->>'status'='conflict','ties never choose arbitrary rule');
UPDATE commercial_message_rules SET active=false WHERE name='conflicting';
SELECT pg_temp.assert((SELECT version=2 FROM commercial_message_rules WHERE name='conflicting'),'rule versions');
DO $$ BEGIN
 BEGIN PERFORM commercial_configure('00000000-0000-0000-0000-000000000001','rule',jsonb_build_object('name','cross tenant','operator','exact','pattern','x','origin_id',(SELECT id FROM commercial_origins WHERE code='google_ads'),'endpoint_id','00000000-0000-0000-0000-000000000031')); RAISE EXCEPTION 'FAIL: cross tenant endpoint accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
END $$;
SELECT commercial_capture('00000000-0000-0000-0000-000000000001','first','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000060','whatsapp',now(),true,true,'{"ctwa_clid":"click-meta","source_type":"ad"}',NULL,'00000000-0000-0000-0000-000000000030','Olá, vim pelo Google!');
SELECT pg_temp.assert((SELECT s.code='meta_ads' AND a.method='direct' FROM commercial_attributions a JOIN commercial_origins s ON s.id=a.origin_id WHERE a.entity_type='contact'),'direct CTWA wins over message rule and stale contact gclid');
SELECT commercial_capture('00000000-0000-0000-0000-000000000001','second','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000061','whatsapp',now(),false,true,'{}',NULL,'00000000-0000-0000-0000-000000000030','Olá, vim pelo Google!');
SELECT pg_temp.assert((SELECT s.code='google_ads' AND a.method='message_rule' FROM commercial_attributions a JOIN commercial_origins s ON s.id=a.origin_id WHERE a.entity_id='00000000-0000-0000-0000-000000000061'),'second opportunity gets independent Google origin');
SELECT pg_temp.assert((SELECT s.code='meta_ads' FROM commercial_attributions a JOIN commercial_origins s ON s.id=a.origin_id WHERE a.entity_type='contact'),'contact keeps initial Meta');
SELECT commercial_capture('00000000-0000-0000-0000-000000000001','second','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000061','whatsapp',now(),false,true,'{}',NULL,NULL,'Olá, vim pelo Google!');
SELECT pg_temp.assert((SELECT count(*)=2 FROM commercial_origin_events),'capture idempotency');
SELECT commercial_capture('00000000-0000-0000-0000-000000000001','during-conversation','00000000-0000-0000-0000-000000000040',NULL,'whatsapp',now(),false,false,'{}',NULL,NULL,'Olá, vim pelo Google!');
SELECT pg_temp.assert((SELECT result->>'status'='unlinked' FROM commercial_origin_events WHERE external_key='during-conversation'),'later sentence does not count as acquisition');
SELECT pg_temp.assert((SELECT count(*)=3 FROM commercial_attributions),'later sentence creates no attribution');
SELECT commercial_correct('00000000-0000-0000-0000-000000000001','opportunity','00000000-0000-0000-0000-000000000061',(SELECT id FROM commercial_origins WHERE code='referral'),NULL,'Cliente confirmou indicação');
SELECT commercial_process_event((SELECT id FROM commercial_origin_events WHERE external_key='second'));
SELECT pg_temp.assert((SELECT s.code='referral' AND a.method='manual' FROM commercial_attributions a JOIN commercial_origins s ON s.id=a.origin_id WHERE a.entity_id='00000000-0000-0000-0000-000000000061'),'manual correction protected');
SELECT pg_temp.assert(NOT EXISTS((SELECT kind,data FROM marketing_baseline EXCEPT SELECT 'contact',to_jsonb(c) FROM contacts c EXCEPT SELECT 'opportunity',to_jsonb(o) FROM opportunities o)),'legacy marketing and CRM records unchanged');
SELECT pg_temp.assert((commercial_records('00000000-0000-0000-0000-000000000001','opportunity','{}',1,0,true)->>'total')::int=2,'server total before pagination');
SELECT pg_temp.assert(jsonb_array_length(commercial_records('00000000-0000-0000-0000-000000000001','opportunity','{}',1,1,false)->'items')=1,'second page');
SELECT pg_temp.assert((commercial_report('00000000-0000-0000-0000-000000000001','{}')->>'opportunities')::int=2,'report total');
SELECT pg_temp.assert((commercial_records('00000000-0000-0000-0000-000000000001','opportunity','{"origin":"unknown"}',25,0,true)->>'total')::int=0,'unknown filter');
SELECT pg_temp.assert((commercial_records('00000000-0000-0000-0000-000000000001','contact','{"search":"5511"}',25,0,false)->>'total')::int=1,'phone search scoped');
SELECT commercial_backfill('00000000-0000-0000-0000-000000000001',now()-interval '1 day',now()+interval '1 day');
-- Late rule + preview/apply: decision/version and attribution revisions are revalidated.
INSERT INTO opportunities(id,organization_id,contact_id,owner_user_id,title,status,amount,currency,pipeline_stage_id) VALUES
 ('00000000-0000-0000-0000-000000000062','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000010','Late rule','open',20,'USD','00000000-0000-0000-0000-000000000050');
SELECT commercial_capture('00000000-0000-0000-0000-000000000001','late-rule','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000062','whatsapp',now(),false,true,'{}',NULL,NULL,'Texto exclusivo!');
SELECT commercial_configure('00000000-0000-0000-0000-000000000001','rule',jsonb_build_object('name','Late rule','operator','exact','pattern','Texto exclusivo!','origin_id',(SELECT id FROM commercial_origins WHERE code='google_ads')));
DO $$ DECLARE preview jsonb; result jsonb; BEGIN
 SELECT value INTO preview FROM jsonb_array_elements(commercial_backfill('00000000-0000-0000-0000-000000000001',now()-interval '1 day',now()+interval '1 day')->'items') WHERE value->>'opportunity_id'='00000000-0000-0000-0000-000000000062';
 PERFORM pg_temp.assert((SELECT origin_id IS NULL FROM commercial_attributions WHERE entity_id='00000000-0000-0000-0000-000000000062'),'preview never writes attribution');
 UPDATE commercial_message_rules SET priority=101 WHERE name='Late rule';
 result:=commercial_apply_preview('00000000-0000-0000-0000-000000000001',jsonb_build_array(preview));
 PERFORM pg_temp.assert(result->>'updated'='0' AND result->>'skipped'='1','changed rule invalidates preview');
 SELECT value INTO preview FROM jsonb_array_elements(commercial_backfill('00000000-0000-0000-0000-000000000001',now()-interval '1 day',now()+interval '1 day')->'items') WHERE value->>'opportunity_id'='00000000-0000-0000-0000-000000000062';
 result:=commercial_apply_preview('00000000-0000-0000-0000-000000000001',jsonb_build_array(preview));
 PERFORM pg_temp.assert(result->>'updated'='1','valid preview fills unknown opportunity');
 result:=commercial_apply_preview('00000000-0000-0000-0000-000000000001',jsonb_build_array(preview));
 PERFORM pg_temp.assert(result->>'updated'='0','apply is idempotent');
END $$;
SELECT pg_temp.assert(commercial_normalize('OLÁ, GOOGLE!')='olá, google!','Portuguese uppercase portable across database locales');
SELECT commercial_configure('00000000-0000-0000-0000-000000000001','rule',jsonb_build_object('name','Literal contains','operator','contains','pattern','100% .*','endpoint_id','00000000-0000-0000-0000-000000000030','origin_id',(SELECT id FROM commercial_origins WHERE code='google_ads')));
SELECT pg_temp.assert(commercial_match_message('00000000-0000-0000-0000-000000000001','100% .* teste','00000000-0000-0000-0000-000000000030')->>'status'='matched','contains is literal, not regex');
SELECT pg_temp.assert(commercial_match_message('00000000-0000-0000-0000-000000000001','100% .* teste',NULL)->>'status'='unknown','endpoint-specific rule not global');
SELECT commercial_capture('00000000-0000-0000-0000-000000000001','direct-conflict','00000000-0000-0000-0000-000000000040',NULL,'form',now(),false,true,'{"gclid":"g","ctwa_clid":"m"}');
SELECT pg_temp.assert((SELECT result->>'status'='conflict' FROM commercial_origin_events WHERE external_key='direct-conflict'),'conflicting direct evidence is not resolved by text');
SELECT pg_temp.assert((commercial_report('00000000-0000-0000-0000-000000000001','{"currency":"USD"}')->>'opportunities')::int=1,'currency drilldown matches group');
SELECT pg_temp.assert(commercial_records('00000000-0000-0000-0000-000000000001','opportunity','{"sort":"amount","sort_direction":"ascending"}',1,0,false)#>>'{items,0,amount}'='20','amount ordering is numeric');
-- Database trigger exercises the actual Meta/Twilio persistence boundary, without changing marketing.
INSERT INTO message_threads VALUES('00000000-0000-0000-0000-000000000070','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000040','whatsapp');
INSERT INTO messages(id,organization_id,thread_id,direction,metadata,content,media_type,endpoint_id) VALUES
 ('00000000-0000-0000-0000-000000000080','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000070','inbound','{"commercial_entry":{"first_contact_entry":false}}','Olá, vim pelo Google!',NULL,'00000000-0000-0000-0000-000000000030'),
 ('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000070','inbound','{"commercial_entry":{"first_contact_entry":false}}','Olá, vim pelo Google!','audio','00000000-0000-0000-0000-000000000030'),
 ('00000000-0000-0000-0000-000000000082','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000070','outbound','{}','Olá, vim pelo Google!',NULL,'00000000-0000-0000-0000-000000000030');
SELECT pg_temp.assert((SELECT result->>'status'='unlinked' FROM commercial_origin_events WHERE message_id='00000000-0000-0000-0000-000000000080'),'message during service stays unlinked');
SELECT pg_temp.assert((SELECT text_content IS NULL AND result->>'status'='unknown' FROM commercial_origin_events WHERE message_id='00000000-0000-0000-0000-000000000081'),'media placeholder is not matched');
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM commercial_origin_events WHERE message_id='00000000-0000-0000-0000-000000000082'),'outbound text is not captured');
SELECT commercial_capture('00000000-0000-0000-0000-000000000001','late-rule','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000062','whatsapp',now(),false,true,'{"ctwa_clid":"late-meta"}',NULL,NULL,'Texto exclusivo!');
SELECT pg_temp.assert((SELECT a.method='direct' AND s.code='meta_ads' FROM commercial_attributions a JOIN commercial_origins s ON s.id=a.origin_id WHERE entity_id='00000000-0000-0000-0000-000000000062'),'late direct evidence can upgrade only its own entry');
SELECT commercial_capture('00000000-0000-0000-0000-000000000001','different-entry','00000000-0000-0000-0000-000000000040',NULL,'form',now(),true,true,'{"gclid":"later-google"}');
SELECT pg_temp.assert((SELECT s.code='meta_ads' FROM commercial_attributions a JOIN commercial_origins s ON s.id=a.origin_id WHERE entity_type='contact'),'later entry cannot replace initial contact origin');
DO $$ DECLARE before_count bigint; BEGIN
 SELECT count(*) INTO before_count FROM commercial_attribution_history;
 PERFORM commercial_import_history('00000000-0000-0000-0000-000000000001',now()-interval '1 day',now()+interval '1 day');
 PERFORM pg_temp.assert((SELECT count(*)=before_count FROM commercial_attribution_history),'historical preparation does not write attributions');
 PERFORM pg_temp.assert((SELECT evidence->>'source'='ctwa' AND evidence->>'legacy_opportunity'='true' FROM commercial_origin_events WHERE external_key='legacy-opportunity:00000000-0000-0000-0000-000000000060'),'legacy opportunity imports only its own evidence');
END $$;
-- Cleanup of legacy entities must not be blocked by new references.
DELETE FROM messages WHERE id='00000000-0000-0000-0000-000000000080';
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM commercial_origin_events WHERE external_key='message:00000000-0000-0000-0000-000000000080'),'message removal cascades its raw event');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((SELECT count(*)=4 FROM commercial_attributions),'RLS admin reads organization records');
DO $$ BEGIN
 BEGIN PERFORM commercial_match_message('00000000-0000-0000-0000-000000000001','x',NULL);RAISE EXCEPTION 'FAIL: internal matcher public'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM commercial_configure('00000000-0000-0000-0000-000000000002','enable','{"enabled":true}');RAISE EXCEPTION 'FAIL: cross tenant configure'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000011',true);
SELECT pg_temp.assert((SELECT count(*)=0 FROM commercial_attributions),'RLS hides unowned records');
SELECT pg_temp.assert((commercial_report('00000000-0000-0000-0000-000000000001','{}')->>'opportunities')::int=0,'report excludes unowned records');
RESET ROLE;
DELETE FROM contacts WHERE id='00000000-0000-0000-0000-000000000040';
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM commercial_attributions WHERE entity_type='contact'),'hard delete cleans commercial sidecars without blocking legacy deletion');
DELETE FROM opportunities WHERE organization_id='00000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM commercial_attributions),'opportunity deletion cleans remaining sidecars');
ROLLBACK;
SELECT 'commercial attribution tests passed' result;
