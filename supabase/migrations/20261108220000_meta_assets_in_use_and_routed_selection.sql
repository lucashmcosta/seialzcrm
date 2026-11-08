-- Ativos Meta: duas correções que valem para todas as orgs.
--
-- 1) Orgs na mesma empresa da Meta conectam com o mesmo usuário de sistema, e a descoberta
--    lista tudo o que ele enxerga. rpc_meta_assets_in_use_elsewhere diz quais ativos desta
--    conexão já estão selecionados em OUTRA org, sem revelar qual, para a tela escondê-los.
--
-- 2) Rotas ficam fixadas na conexão antiga para não interromper a operação, mas a tela edita
--    a conexão mais nova: a seleção salva não chegava à sincronização. Agora é copiada para
--    a conexão de cada rota. A rota NÃO muda (o histórico sincronizado pertence a ela).

CREATE OR REPLACE FUNCTION public.rpc_meta_assets_in_use_elsewhere(p_org uuid, p_connection uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT a.id
  FROM meta_assets a
  WHERE a.organization_id = p_org AND a.connection_id = p_connection
    AND EXISTS (
      SELECT 1 FROM user_organizations uo JOIN users u ON u.id = uo.user_id
      WHERE uo.organization_id = p_org AND uo.is_active AND u.auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM meta_assets other
      JOIN meta_connections c ON c.id = other.connection_id AND c.status = 'connected'
      WHERE other.asset_type = a.asset_type AND other.external_id = a.external_id
        AND other.organization_id <> p_org AND other.selection_state = 'selected'
    );
$$;
REVOKE ALL ON FUNCTION public.rpc_meta_assets_in_use_elsewhere(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_meta_assets_in_use_elsewhere(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_select_meta_assets(p_org uuid, p_connection uuid, p_selections jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Copia a seleção para a conexão fixada na rota de cada tipo de ativo. Só cria a linha lá
  -- quando o ativo foi selecionado; desmarcado só atualiza o que já existe.
  INSERT INTO meta_assets(organization_id,connection_id,asset_type,external_id,name,metadata,selection_state)
    SELECT p_org, r.connection_id, a.asset_type, a.external_id, a.name, a.metadata, a.selection_state
    FROM jsonb_to_recordset(p_selections) AS x(asset_id uuid,selection_state text)
    JOIN meta_assets a ON a.id=x.asset_id AND a.connection_id=p_connection AND a.organization_id=p_org
    JOIN meta_operational_routes r ON r.organization_id=p_org AND r.route='asset:'||a.asset_type
      AND r.source='canonical' AND r.connection_id IS NOT NULL AND r.connection_id<>p_connection
    JOIN meta_connections rc ON rc.id=r.connection_id AND rc.organization_id=p_org AND rc.status='connected'
    WHERE a.selection_state='selected' OR EXISTS (
      SELECT 1 FROM meta_assets e WHERE e.connection_id=r.connection_id
        AND e.asset_type=a.asset_type AND e.external_id=a.external_id)
    ON CONFLICT (connection_id,asset_type,external_id)
      DO UPDATE SET selection_state=EXCLUDED.selection_state;

  -- Instagram copiado aponta para a Página equivalente da conexão de destino.
  UPDATE meta_assets child SET parent_asset_id=target_parent.id
    FROM meta_assets source_child
    JOIN meta_assets source_parent ON source_parent.id=source_child.parent_asset_id
    JOIN meta_assets target_parent ON target_parent.asset_type=source_parent.asset_type
      AND target_parent.external_id=source_parent.external_id
    WHERE source_child.connection_id=p_connection AND source_child.organization_id=p_org
      AND child.organization_id=p_org AND child.connection_id<>p_connection
      AND child.parent_asset_id IS NULL
      AND child.asset_type=source_child.asset_type AND child.external_id=source_child.external_id
      AND target_parent.connection_id=child.connection_id;

  RETURN affected;
END $function$;
REVOKE ALL ON FUNCTION public.rpc_select_meta_assets(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_select_meta_assets(uuid,uuid,jsonb) TO service_role;
