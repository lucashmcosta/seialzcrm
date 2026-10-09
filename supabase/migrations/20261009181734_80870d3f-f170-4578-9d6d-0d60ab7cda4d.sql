CREATE OR REPLACE FUNCTION public.cs_round_robin_overview(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.can_manage_cs_round_robin(_org) THEN RAISE EXCEPTION 'rbac_denied' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'enabled', (SELECT cs_round_robin_enabled FROM organizations WHERE id = _org),
    'people', COALESCE(jsonb_agg(row ORDER BY (row->>'full_name')), '[]'::jsonb))
  INTO v
  FROM (
    SELECT jsonb_build_object(
      'user_id', u.id,
      'full_name', COALESCE(u.full_name, u.email, 'Usuário'),
      'has_access', (COALESCE(p #>> '{dados,atendimentos,ver}','nenhum') <> 'nenhum'
                     AND COALESCE(p #>> '{dados,atendimentos,editar}','nenhum') <> 'nenhum'),
      'member_active', COALESCE(m.active, false),
      'open_now', (SELECT count(*) FROM message_threads t WHERE t.organization_id=_org AND t.assigned_user_id=u.id
                    AND t.business_context='customer_service' AND t.status NOT IN ('resolved','closed')),
      'today', (SELECT count(*) FROM thread_assignment_history h WHERE h.organization_id=_org AND h.to_user_id=u.id
                    AND h.metadata->>'source'='cs_round_robin' AND h.created_at >= date_trunc('day', now())),
      'week', (SELECT count(*) FROM thread_assignment_history h WHERE h.organization_id=_org AND h.to_user_id=u.id
                    AND h.metadata->>'source'='cs_round_robin' AND h.created_at >= now() - interval '7 days'),
      'last_at', (SELECT max(h.created_at) FROM thread_assignment_history h WHERE h.organization_id=_org AND h.to_user_id=u.id
                    AND h.metadata->>'source'='cs_round_robin')) AS row
    FROM user_organizations uo
    JOIN users u ON u.id = uo.user_id
    CROSS JOIN LATERAL (SELECT public.perms_v2_for_user(_org, u.id) AS p) pp
    LEFT JOIN cs_round_robin_members m ON m.organization_id=_org AND m.user_id=u.id
    WHERE uo.organization_id = _org AND uo.is_active
  ) s;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.cs_round_robin_preview(_org uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_cs_round_robin(_org) THEN RAISE EXCEPTION 'rbac_denied' USING ERRCODE='42501'; END IF;
  RETURN (SELECT count(*) FROM message_threads t
          WHERE t.organization_id=_org AND t.business_context='customer_service'
            AND t.status NOT IN ('resolved','closed') AND t.assigned_user_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM cs_round_robin_members m WHERE m.organization_id=_org
                              AND m.user_id=t.assigned_user_id AND m.active));
END $$;

CREATE OR REPLACE FUNCTION public.cs_round_robin_enable(_org uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_to uuid; v_reason text; n_back int := 0; n_rr int := 0; n_none int := 0;
BEGIN
  IF NOT public.can_manage_cs_round_robin(_org) THEN RAISE EXCEPTION 'rbac_denied' USING ERRCODE='42501'; END IF;
  UPDATE organizations SET cs_round_robin_enabled = true WHERE id = _org;
  FOR r IN SELECT t.id, t.assigned_user_id FROM message_threads t
           WHERE t.organization_id=_org AND t.business_context='customer_service'
             AND t.status NOT IN ('resolved','closed') AND t.assigned_user_id IS NOT NULL
             AND NOT public.can_receive_cs(_org, t.assigned_user_id)
           FOR UPDATE OF t
  LOOP
    SELECT h.to_user_id INTO v_to FROM thread_assignment_history h
     WHERE h.thread_id = r.id AND h.to_user_id IS NOT NULL AND h.to_user_id <> r.assigned_user_id
       AND public.can_receive_cs(_org, h.to_user_id)
     ORDER BY h.created_at DESC LIMIT 1;
    IF v_to IS NOT NULL THEN v_reason := 'Devolvida para quem atendia'; n_back := n_back + 1;
    ELSE
      v_to := public.assign_cs_round_robin(_org);
      IF v_to IS NOT NULL THEN v_reason := 'Rodízio do Atendimento'; n_rr := n_rr + 1;
      ELSE v_reason := 'Sem responsável'; n_none := n_none + 1; END IF;
    END IF;
    UPDATE message_threads SET assigned_user_id = v_to,
      last_routing_decision = jsonb_build_object('action','auto_reassign','reason',v_reason,
        'source','cs_round_robin','by_user_id', public.current_user_id(),
        'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
     WHERE id = r.id;
    v_to := NULL;
  END LOOP;
  RETURN jsonb_build_object('returned', n_back, 'round_robin', n_rr, 'unassigned', n_none);
END $$;

CREATE OR REPLACE FUNCTION public.cs_round_robin_disable(_org uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_cs_round_robin(_org) THEN RAISE EXCEPTION 'rbac_denied' USING ERRCODE='42501'; END IF;
  UPDATE organizations SET cs_round_robin_enabled = false WHERE id = _org;
END $$;

REVOKE EXECUTE ON FUNCTION public.cs_round_robin_overview(uuid), public.cs_round_robin_preview(uuid),
  public.cs_round_robin_enable(uuid), public.cs_round_robin_disable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cs_round_robin_overview(uuid), public.cs_round_robin_preview(uuid),
  public.cs_round_robin_enable(uuid), public.cs_round_robin_disable(uuid) TO authenticated;