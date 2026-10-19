-- OAuth authorization and operational routing are separate. No credential is overwritten.
ALTER TABLE public.meta_connections ADD COLUMN activation_state text NOT NULL DEFAULT 'ready'
  CHECK (activation_state IN ('pending', 'ready'));
CREATE TABLE public.meta_operational_routes (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  route text NOT NULL,
  connection_id uuid REFERENCES public.meta_connections(id),
  source text NOT NULL CHECK (source IN ('canonical','legacy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, route),
  CHECK ((source = 'canonical') = (connection_id IS NOT NULL))
);
ALTER TABLE public.meta_operational_routes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.meta_operational_routes TO authenticated;
GRANT ALL ON public.meta_operational_routes TO service_role;
CREATE POLICY meta_routes_read ON public.meta_operational_routes FOR SELECT TO authenticated
  USING (organization_id = ANY(public.current_user_org_ids()));

-- Capture the previous routing and persist the new authorization in one transaction.
CREATE FUNCTION public.rpc_create_meta_oauth_connection(p_org uuid, p_user uuid, p_meta jsonb, p_ciphertext text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE new_id uuid; old_id uuid; asset_type_name text; route_name text; canonical_on boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_organizations WHERE organization_id=p_org AND user_id=p_user AND is_active) THEN
    RAISE EXCEPTION 'forbidden_org';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('meta-oauth:' || p_org::text, 0));
  IF p_ciphertext IS NULL OR length(p_ciphertext)=0 THEN RAISE EXCEPTION 'credentials_missing'; END IF;
  canonical_on := public.fn_feature_flag_enabled('meta_canonical_credential',p_org);
  FOREACH route_name IN ARRAY ARRAY['lead-generation','capi'] LOOP
    SELECT id INTO old_id FROM meta_connections WHERE organization_id=p_org AND status='connected'
      AND activation_state='ready' AND COALESCE(last_health,'ok') NOT IN ('expired','error')
      AND (expires_at IS NULL OR expires_at>now()) AND (data_access_expires_at IS NULL OR data_access_expires_at>now())
      AND (route_name<>'lead-generation' OR 'leads_retrieval'=ANY(granted_scopes))
      ORDER BY created_at DESC,id DESC LIMIT 1;
    IF canonical_on AND old_id IS NOT NULL THEN
      INSERT INTO meta_operational_routes(organization_id,route,connection_id,source)
        VALUES(p_org,route_name,old_id,'canonical') ON CONFLICT DO NOTHING;
    ELSIF EXISTS (SELECT 1 FROM organization_integrations oi JOIN admin_integrations ai ON ai.id=oi.integration_id
      WHERE oi.organization_id=p_org AND oi.is_enabled AND ai.slug=CASE route_name WHEN 'capi' THEN 'meta-capi' ELSE 'meta-lead-ads' END) THEN
      INSERT INTO meta_operational_routes(organization_id,route,connection_id,source)
        VALUES(p_org,route_name,NULL,'legacy') ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  FOREACH asset_type_name IN ARRAY ARRAY['page','instagram_account','ad_account','business'] LOOP
    SELECT c.id INTO old_id FROM meta_connections c WHERE c.organization_id=p_org AND c.status='connected'
      AND c.activation_state='ready' AND EXISTS (SELECT 1 FROM meta_assets a WHERE a.connection_id=c.id
        AND a.organization_id=p_org AND a.asset_type=asset_type_name AND a.selection_state='selected')
      ORDER BY c.created_at DESC,c.id DESC LIMIT 1;
    IF old_id IS NOT NULL THEN
      INSERT INTO meta_operational_routes(organization_id,route,connection_id,source)
        VALUES(p_org,'asset:'||asset_type_name,old_id,'canonical') ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  INSERT INTO meta_connections(organization_id,status,activation_state,authorizing_meta_user_id,
    authorizing_meta_user_name,granted_scopes,granular_scopes,token_type,expires_at,data_access_expires_at,
    config_id,app_id,last_token_check_at,last_health,source,created_by_user_id)
  VALUES(p_org,'connected','pending',p_meta->>'authorizing_meta_user_id',p_meta->>'authorizing_meta_user_name',
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_meta->'granted_scopes','[]'::jsonb))),p_meta->'granular_scopes',
    p_meta->>'token_type',(p_meta->>'expires_at')::timestamptz,(p_meta->>'data_access_expires_at')::timestamptz,
    p_meta->>'config_id',p_meta->>'app_id',now(),'ok','oauth',p_user) RETURNING id INTO new_id;
  INSERT INTO meta_connection_credentials(connection_id,token_encrypted) VALUES(new_id,p_ciphertext);
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.rpc_create_meta_oauth_connection(uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_meta_oauth_connection(uuid,uuid,jsonb,text) TO service_role;

CREATE FUNCTION public.rpc_select_meta_assets(p_org uuid,p_connection uuid,p_selections jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE affected integer; requested integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('meta-oauth:' || p_org::text,0));
  IF NOT EXISTS(SELECT 1 FROM meta_connections WHERE id=p_connection AND organization_id=p_org AND status='connected') THEN
    RAISE EXCEPTION 'connection_not_found';
  END IF;
  SELECT count(*) INTO requested FROM jsonb_array_elements(p_selections);
  IF requested=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_selections) x WHERE
      (x->>'selection_state') NOT IN ('selected','disabled','discovered') OR x->>'selection_state' IS NULL) THEN
    RAISE EXCEPTION 'invalid_selection';
  END IF;
  UPDATE meta_assets a SET selection_state=x.selection_state
    FROM jsonb_to_recordset(p_selections) AS x(asset_id uuid,selection_state text)
    WHERE a.id=x.asset_id AND a.connection_id=p_connection AND a.organization_id=p_org;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>requested THEN RAISE EXCEPTION 'invalid_assets'; END IF;
  IF EXISTS(SELECT 1 FROM meta_assets WHERE connection_id=p_connection AND selection_state='selected') THEN
    UPDATE meta_connections SET activation_state='ready' WHERE id=p_connection;
    INSERT INTO meta_operational_routes(organization_id,route,connection_id,source)
      SELECT DISTINCT p_org,'asset:'||asset_type,p_connection,'canonical' FROM meta_assets
      WHERE connection_id=p_connection AND organization_id=p_org AND selection_state='selected'
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.rpc_select_meta_assets(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_select_meta_assets(uuid,uuid,jsonb) TO service_role;

-- A single synchronization owner for each external asset, even with two authorizations.
CREATE FUNCTION public.rpc_meta_effective_sync_assets(p_org uuid)
RETURNS TABLE(id uuid, connection_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT DISTINCT ON(a.asset_type,a.external_id) a.id,a.connection_id
  FROM meta_assets a JOIN meta_connections c ON c.id=a.connection_id AND c.organization_id=a.organization_id
  LEFT JOIN meta_operational_routes r ON r.organization_id=a.organization_id AND r.route='asset:'||a.asset_type
  WHERE a.organization_id=p_org AND a.selection_state='selected' AND c.status='connected' AND c.activation_state='ready'
    AND (r.connection_id IS NULL OR a.connection_id=r.connection_id)
    AND COALESCE(c.last_health,'ok') NOT IN ('expired','error')
    AND (c.expires_at IS NULL OR c.expires_at>now()) AND (c.data_access_expires_at IS NULL OR c.data_access_expires_at>now())
  ORDER BY a.asset_type,a.external_id,(a.connection_id=r.connection_id) DESC NULLS LAST,c.created_at DESC,a.id DESC;
$$;
REVOKE ALL ON FUNCTION public.rpc_meta_effective_sync_assets(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_meta_effective_sync_assets(uuid) TO service_role;
