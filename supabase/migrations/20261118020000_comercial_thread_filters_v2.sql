-- Filtros do Comercial (v2): uma regra de filtro só, usada pela lista paginada e pelo contador.
-- A v1 (rpc_list_message_threads) continua intacta para quem ainda usa (celular, outras telas).
--
-- p_filters (jsonb), todos opcionais:
--   view            'open' (padrão) | 'to_reply' | 'awaiting_client' | 'resolved'
--   search          texto (nome/telefone)
--   endpoint_ids    uuid[]  número/WhatsApp
--   assigned_user_ids uuid[] / unassigned bool   responsável
--   handlers        text[]  'ai' (IA atendendo) | 'needs_human' (pediu humano) | 'none' (sem ninguém)
--   opp_states      text[]  'open' | 'none' (sem oportunidade aberta) | 'won' | 'lost'
--   stage_ids       uuid[]  etapa de alguma oportunidade do contato
--   opp_tag_ids     uuid[]  etiqueta de alguma oportunidade do contato
--   created_from / created_to   timestamptz  criação da conversa
--   last_from / last_to         timestamptz  última mensagem
--   origin          'ad' | 'organic'
--   ad_ids          text[]  anúncio de origem (contacts.ad_referral_source_id)
--   unread          bool
--   thread_ids      uuid[]  só estas conversas (atualização em tempo real respeitando os filtros)

CREATE OR REPLACE FUNCTION public.fn_comercial_threads_filtered(p_organization_id uuid, p_filters jsonb)
RETURNS TABLE(thread_id uuid, sort_at timestamptz, is_unread boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := current_user_id();
  v_can_view_all_threads boolean;
  v_can_view_all_contacts boolean;
  v_cs_flag boolean;
  v_rbac boolean;
  v_ctx jsonb;
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_view text := coalesce(nullif(f->>'view',''), 'open');
  v_search text := nullif(btrim(coalesce(f->>'search','')), '');
  v_search_name text;
  v_search_digits text;
  v_endpoint_ids uuid[];
  v_assigned uuid[];
  v_unassigned boolean := coalesce((f->>'unassigned')::boolean, false);
  v_handlers text[];
  v_opp_states text[];
  v_stage_ids uuid[];
  v_tag_ids uuid[];
  v_ad_ids text[];
  v_created_from timestamptz := nullif(f->>'created_from','')::timestamptz;
  v_created_to timestamptz := nullif(f->>'created_to','')::timestamptz;
  v_last_from timestamptz := nullif(f->>'last_from','')::timestamptz;
  v_last_to timestamptz := nullif(f->>'last_to','')::timestamptz;
  v_origin text := nullif(f->>'origin','');
  v_unread boolean := coalesce((f->>'unread')::boolean, false);
  v_thread_ids uuid[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.organization_id = p_organization_id AND uo.user_id = v_user_id AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  v_rbac := public.rbac_v2_on(p_organization_id);
  IF v_rbac THEN v_ctx := public.rbac_ctx(); END IF;
  v_can_view_all_threads := user_can_view_all(p_organization_id, 'threads');
  v_can_view_all_contacts := user_can_view_all(p_organization_id, 'contacts');
  SELECT COALESCE(o.cs_inbox_includes_service_endpoints, false) INTO v_cs_flag FROM organizations o WHERE o.id = p_organization_id;

  IF v_search IS NOT NULL THEN
    v_search_name := '%' || v_search || '%';
    v_search_digits := nullif(regexp_replace(v_search, '\D', '', 'g'), '');
  END IF;

  SELECT array_agg(x::uuid) INTO v_endpoint_ids FROM jsonb_array_elements_text(coalesce(f->'endpoint_ids','[]')) x;
  SELECT array_agg(x::uuid) INTO v_assigned FROM jsonb_array_elements_text(coalesce(f->'assigned_user_ids','[]')) x;
  SELECT array_agg(x) INTO v_handlers FROM jsonb_array_elements_text(coalesce(f->'handlers','[]')) x;
  SELECT array_agg(x) INTO v_opp_states FROM jsonb_array_elements_text(coalesce(f->'opp_states','[]')) x;
  SELECT array_agg(x::uuid) INTO v_stage_ids FROM jsonb_array_elements_text(coalesce(f->'stage_ids','[]')) x;
  SELECT array_agg(x::uuid) INTO v_tag_ids FROM jsonb_array_elements_text(coalesce(f->'opp_tag_ids','[]')) x;
  SELECT array_agg(x) INTO v_ad_ids FROM jsonb_array_elements_text(coalesce(f->'ad_ids','[]')) x;
  SELECT array_agg(x::uuid) INTO v_thread_ids FROM jsonb_array_elements_text(coalesce(f->'thread_ids','[]')) x;

  RETURN QUERY
  SELECT mt.id,
    COALESCE(mt.last_message_at, mt.created_at),
    (mt.last_message_direction = 'inbound'
      AND COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) IS NOT NULL
      AND (mtr.last_read_at IS NULL OR COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) > mtr.last_read_at))
  FROM message_threads mt
  INNER JOIN contacts c
    ON c.id = mt.contact_id AND c.organization_id = mt.organization_id AND c.deleted_at IS NULL
    AND (CASE WHEN v_rbac THEN (c.owner_user_id IS NULL OR public.rbac_check(v_ctx, p_organization_id, 'contatos', 'ver', ARRAY[c.owner_user_id])) ELSE (v_can_view_all_contacts OR c.owner_user_id = v_user_id OR mt.assigned_user_id IS NULL) END)
  LEFT JOIN message_thread_reads mtr ON mtr.thread_id = mt.id AND mtr.user_id = v_user_id
  LEFT JOIN communication_endpoints e ON e.id = mt.primary_endpoint_id
  LEFT JOIN messages lm ON lm.id = mt.last_message_id AND lm.thread_id = mt.id AND lm.organization_id = mt.organization_id
  WHERE mt.organization_id = p_organization_id
    AND (v_thread_ids IS NULL OR mt.id = ANY(v_thread_ids))
    AND mt.merged_into_thread_id IS NULL
    AND mt.channel = 'whatsapp'
    AND (CASE WHEN v_rbac THEN public.rbac_check(v_ctx, p_organization_id, public.rbac_thread_obj(mt.business_context), 'ver', ARRAY[mt.assigned_user_id]) ELSE (v_can_view_all_threads OR mt.assigned_user_id = v_user_id OR (mt.assigned_user_id IS NULL AND user_has_cs_permission(p_organization_id, 'can_manage_cs_queue'))) END)
    AND (mt.business_context = 'sales'
      OR (mt.business_context IS NULL AND c.lifecycle_stage IS DISTINCT FROM 'customer'
        AND (NOT v_cs_flag OR e.id IS NULL OR e.purpose IS DISTINCT FROM 'customer_service')))
    -- situação
    AND (CASE v_view
      WHEN 'resolved' THEN mt.status = 'resolved'
      WHEN 'to_reply' THEN mt.status <> 'resolved' AND mt.last_message_direction = 'inbound'
      WHEN 'awaiting_client' THEN mt.status <> 'resolved' AND mt.last_message_direction = 'outbound'
      ELSE mt.status <> 'resolved' END)
    -- responsável
    AND (v_assigned IS NULL AND NOT v_unassigned
      OR mt.assigned_user_id = ANY(coalesce(v_assigned, '{}'))
      OR (v_unassigned AND mt.assigned_user_id IS NULL))
    -- quem atende (mesma regra do card)
    AND (v_handlers IS NULL
      OR ('ai' = ANY(v_handlers) AND mt.assigned_user_id IS NULL AND mt.ai_agent_id IS NOT NULL AND mt.ai_agent_released_at IS NULL AND NOT coalesce(mt.needs_human_attention,false))
      OR ('needs_human' = ANY(v_handlers) AND mt.assigned_user_id IS NULL AND coalesce(mt.needs_human_attention,false))
      OR ('none' = ANY(v_handlers) AND mt.assigned_user_id IS NULL AND NOT coalesce(mt.needs_human_attention,false)
            AND NOT (mt.ai_agent_id IS NOT NULL AND mt.ai_agent_released_at IS NULL)))
    -- oportunidade (ligada pelo contato)
    AND (v_opp_states IS NULL
      OR ('open' = ANY(v_opp_states) AND EXISTS (SELECT 1 FROM opportunities o WHERE o.organization_id = mt.organization_id AND o.contact_id = mt.contact_id AND o.deleted_at IS NULL AND o.status = 'open'))
      OR ('none' = ANY(v_opp_states) AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.organization_id = mt.organization_id AND o.contact_id = mt.contact_id AND o.deleted_at IS NULL AND o.status = 'open'))
      OR ('won' = ANY(v_opp_states) AND EXISTS (SELECT 1 FROM opportunities o WHERE o.organization_id = mt.organization_id AND o.contact_id = mt.contact_id AND o.deleted_at IS NULL AND o.status = 'won'))
      OR ('lost' = ANY(v_opp_states) AND EXISTS (SELECT 1 FROM opportunities o WHERE o.organization_id = mt.organization_id AND o.contact_id = mt.contact_id AND o.deleted_at IS NULL AND o.status = 'lost')))
    AND (v_stage_ids IS NULL OR EXISTS (SELECT 1 FROM opportunities o WHERE o.organization_id = mt.organization_id AND o.contact_id = mt.contact_id AND o.deleted_at IS NULL AND o.pipeline_stage_id = ANY(v_stage_ids)))
    AND (v_tag_ids IS NULL OR EXISTS (SELECT 1 FROM opportunities o JOIN tag_assignments ta ON ta.entity_type = 'opportunity' AND ta.entity_id = o.id AND ta.organization_id = o.organization_id
           WHERE o.organization_id = mt.organization_id AND o.contact_id = mt.contact_id AND o.deleted_at IS NULL AND ta.tag_id = ANY(v_tag_ids)))
    -- datas
    AND (v_created_from IS NULL OR mt.created_at >= v_created_from)
    AND (v_created_to IS NULL OR mt.created_at < v_created_to)
    AND (v_last_from IS NULL OR COALESCE(mt.last_message_at, mt.created_at) >= v_last_from)
    AND (v_last_to IS NULL OR COALESCE(mt.last_message_at, mt.created_at) < v_last_to)
    -- origem
    AND (v_origin IS NULL
      OR (v_origin = 'ad' AND (c.ad_referral_source_id IS NOT NULL OR c.source IN ('ctwa','meta_ctwa')))
      OR (v_origin = 'organic' AND c.ad_referral_source_id IS NULL AND c.source IS DISTINCT FROM 'ctwa' AND c.source IS DISTINCT FROM 'meta_ctwa'))
    AND (v_ad_ids IS NULL OR c.ad_referral_source_id = ANY(v_ad_ids))
    -- número e busca
    AND (v_endpoint_ids IS NULL OR COALESCE(lm.endpoint_id, mt.primary_endpoint_id) = ANY(v_endpoint_ids))
    AND (v_search_name IS NULL OR c.full_name ILIKE v_search_name OR c.phone ILIKE v_search_name
      OR (v_search_digits IS NOT NULL AND c.phone_normalized ILIKE '%' || v_search_digits || '%'))
    -- não lidas
    AND (NOT v_unread OR (mt.last_message_direction = 'inbound'
      AND COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) IS NOT NULL
      AND (mtr.last_read_at IS NULL OR COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) > mtr.last_read_at)));
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_comercial_threads_filtered(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Lista paginada (50 por vez), com os dados do card: quem atende e a oportunidade aberta.
CREATE OR REPLACE FUNCTION public.rpc_list_message_threads_v2(
  p_organization_id uuid, p_filters jsonb DEFAULT '{}'::jsonb,
  p_cursor_updated_at timestamptz DEFAULT NULL, p_cursor_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, contact_id uuid, contact_name text, contact_phone text, channel text, subject text, status text,
  last_message_id uuid, last_message_content text, last_message_direction text, last_message_at timestamptz,
  last_inbound_at timestamptz, whatsapp_last_inbound_at timestamptz, needs_human_attention boolean, agent_typing boolean,
  awaiting_button_response boolean, assigned_user_id uuid, assigned_user_name text, updated_at timestamptz, created_at timestamptz,
  is_unread boolean, ai_agent_name text, open_opportunity_id uuid, open_stage_id uuid, open_stage_name text, open_opportunity_tags jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT mt.id, mt.contact_id, c.full_name, c.phone, mt.channel, mt.subject, mt.status,
    mt.last_message_id, mt.last_message_content, mt.last_message_direction, mt.last_message_at,
    mt.last_inbound_at, mt.whatsapp_last_inbound_at, mt.needs_human_attention, mt.agent_typing,
    mt.awaiting_button_response, mt.assigned_user_id, u.full_name, mt.updated_at, mt.created_at,
    f.is_unread,
    CASE WHEN mt.ai_agent_id IS NOT NULL AND mt.ai_agent_released_at IS NULL
      THEN regexp_replace(coalesce(ag.name, 'IA'), '\s+AI$', '', 'i') END,
    op.id, op.pipeline_stage_id, ps.name,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
      FROM tag_assignments ta JOIN tags t ON t.id = ta.tag_id
      WHERE ta.entity_type = 'opportunity' AND ta.entity_id = op.id AND ta.organization_id = mt.organization_id), '[]'::jsonb)
  FROM public.fn_comercial_threads_filtered(p_organization_id, p_filters) f
  JOIN message_threads mt ON mt.id = f.thread_id
  JOIN contacts c ON c.id = mt.contact_id
  LEFT JOIN users u ON u.id = mt.assigned_user_id
  LEFT JOIN ai_agents ag ON ag.id = mt.ai_agent_id
  LEFT JOIN LATERAL (SELECT o.id, o.pipeline_stage_id FROM opportunities o
      WHERE o.organization_id = mt.organization_id AND o.contact_id = mt.contact_id AND o.deleted_at IS NULL AND o.status = 'open'
      ORDER BY o.updated_at DESC LIMIT 1) op ON true
  LEFT JOIN pipeline_stages ps ON ps.id = op.pipeline_stage_id
  WHERE (p_cursor_updated_at IS NULL OR (f.sort_at, mt.id) < (p_cursor_updated_at, p_cursor_id))
  ORDER BY f.sort_at DESC NULLS LAST, mt.id DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

-- Contador total com os MESMOS filtros da lista.
CREATE OR REPLACE FUNCTION public.rpc_count_message_threads_v2(p_organization_id uuid, p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT count(*) FROM public.fn_comercial_threads_filtered(p_organization_id, p_filters);
$function$;

REVOKE ALL ON FUNCTION public.rpc_list_message_threads_v2(uuid, jsonb, timestamptz, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_count_message_threads_v2(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_message_threads_v2(uuid, jsonb, timestamptz, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_count_message_threads_v2(uuid, jsonb) TO authenticated;
