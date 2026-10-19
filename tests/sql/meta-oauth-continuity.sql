\set ON_ERROR_STOP on
BEGIN;
\ir meta-review-base.sql
DO $$
DECLARE org uuid; other_org uuid; usr uuid; system_id uuid; oauth_id uuid; asset uuid; candidate_asset uuid; count_before integer;
BEGIN
  INSERT INTO organizations DEFAULT VALUES RETURNING id INTO org;
  INSERT INTO organizations DEFAULT VALUES RETURNING id INTO other_org;
  INSERT INTO users DEFAULT VALUES RETURNING id INTO usr;
  INSERT INTO user_organizations VALUES(org,usr,true);
  INSERT INTO meta_connections(organization_id,token_type,granted_scopes) VALUES(org,'system_user',ARRAY['leads_retrieval','pages_messaging']) RETURNING id INTO system_id;
  INSERT INTO meta_connection_credentials(connection_id,token_encrypted) VALUES(system_id,'unchanged-fixture-ciphertext');
  INSERT INTO meta_assets(organization_id,connection_id,asset_type,external_id,selection_state) VALUES(org,system_id,'page','123','selected') RETURNING id INTO asset;
  INSERT INTO organization_integrations(meta_connection_id) VALUES(system_id);
  oauth_id := rpc_create_meta_oauth_connection(org,usr,'{"token_type":"user","granted_scopes":["pages_messaging"]}','new-fixture-ciphertext');
  ASSERT (SELECT count(*)=2 FROM meta_connections WHERE organization_id=org), 'authorizations must coexist';
  ASSERT (SELECT activation_state='pending' FROM meta_connections WHERE id=oauth_id), 'OAuth starts pending';
  ASSERT (SELECT count(*)=3 FROM meta_operational_routes WHERE connection_id=system_id), 'working module routes must be pinned';
  INSERT INTO meta_assets(organization_id,connection_id,asset_type,external_id) VALUES(org,oauth_id,'page','123') RETURNING id INTO candidate_asset;
  PERFORM rpc_select_meta_assets(org,oauth_id,jsonb_build_array(jsonb_build_object('asset_id',candidate_asset,'selection_state','selected')));
  ASSERT (SELECT activation_state='ready' FROM meta_connections WHERE id=oauth_id), 'validated selection activates authorization';
  ASSERT (SELECT count(*)=1 AND bool_and(connection_id=system_id) FROM rpc_meta_effective_sync_assets(org)), 'system user remains sole sync owner';
  ASSERT (SELECT token_encrypted='unchanged-fixture-ciphertext' FROM meta_connection_credentials WHERE connection_id=system_id), 'system credential must be unchanged';
  ASSERT (SELECT bool_and(meta_connection_id=system_id) FROM organization_integrations), 'legacy module linkage must be unchanged';
  BEGIN
    PERFORM rpc_select_meta_assets(other_org,oauth_id,jsonb_build_array(jsonb_build_object('asset_id',candidate_asset,'selection_state','disabled')));
    RAISE EXCEPTION 'tenant check did not reject';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='connection_not_found', 'cross-org selection must fail'; END;
  BEGIN
    PERFORM rpc_select_meta_assets(org,oauth_id,jsonb_build_array(jsonb_build_object('asset_id',candidate_asset,'selection_state','disabled'),jsonb_build_object('asset_id',gen_random_uuid(),'selection_state','selected')));
    RAISE EXCEPTION 'atomic check did not reject';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='invalid_assets', 'invalid selection must roll back'; END;
  ASSERT (SELECT selection_state='selected' FROM meta_assets WHERE id=candidate_asset), 'failed batch must leave selection unchanged';
  SELECT count(*) INTO count_before FROM meta_connections;
  BEGIN
    PERFORM rpc_create_meta_oauth_connection(other_org,usr,'{"token_type":"user"}','fake');
    RAISE EXCEPTION 'membership check did not reject';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='forbidden_org', 'membership check'; END;
  ASSERT (SELECT count(*)=count_before FROM meta_connections), 'rejected OAuth must not persist';
  ASSERT NOT has_function_privilege('authenticated','rpc_create_meta_oauth_connection(uuid,uuid,jsonb,text)','EXECUTE'), 'frontend cannot write credentials';
  ASSERT NOT has_table_privilege('authenticated','meta_connection_credentials','SELECT'), 'frontend cannot read credentials';
END $$;
-- A first authorization has no prior module route to preserve. Legacy remains pinned only when configured.
DO $$
DECLARE org uuid; usr uuid; oauth uuid; integration uuid;
BEGIN
  INSERT INTO organizations DEFAULT VALUES RETURNING id INTO org;
  INSERT INTO users DEFAULT VALUES RETURNING id INTO usr;
  INSERT INTO user_organizations VALUES(org,usr,true);
  oauth := rpc_create_meta_oauth_connection(org,usr,'{"token_type":"user"}','fixture');
  ASSERT (SELECT count(*)=0 FROM meta_operational_routes WHERE organization_id=org), 'new org must not be permanently pinned to absent legacy credentials';
  INSERT INTO admin_integrations(slug) VALUES('meta-capi') RETURNING id INTO integration;
  INSERT INTO organization_integrations(organization_id,integration_id,is_enabled) VALUES(org,integration,true);
  PERFORM set_config('test.canonical','false',true);
  PERFORM rpc_create_meta_oauth_connection(org,usr,'{"token_type":"user"}','fixture-2');
  ASSERT (SELECT source='legacy' AND connection_id IS NULL FROM meta_operational_routes WHERE organization_id=org AND route='capi'), 'existing legacy CAPI must remain legacy';
END $$;
ROLLBACK;
