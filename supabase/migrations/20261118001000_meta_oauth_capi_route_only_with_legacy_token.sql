-- Reconexão Meta não pode fixar a CAPI em 'legacy' quando a org não tem token legado.
-- Antes: bastava a integração meta-capi estar ligada para gravar route=capi/source=legacy.
-- Em orgs só canônicas (sem access_token_encrypted) isso derrubava o envio de eventos
-- (routedCandidates devolve [] para 'legacy' e não há token legado) — visto na Auxilius em 17/11.
-- Agora: a CAPI só é fixada em 'legacy' se existir o token legado; sem ele, nenhuma rota é gravada
-- e vale a regra de antes da reconexão (conexão canônica mais recente).
CREATE OR REPLACE FUNCTION public.rpc_create_meta_oauth_connection(p_org uuid, p_user uuid, p_meta jsonb, p_ciphertext text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      WHERE oi.organization_id=p_org AND oi.is_enabled AND ai.slug=CASE route_name WHEN 'capi' THEN 'meta-capi' ELSE 'meta-lead-ads' END
        AND (route_name <> 'capi' OR nullif(oi.connected_account->>'access_token_encrypted','') IS NOT NULL)) THEN
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
END $function$;
