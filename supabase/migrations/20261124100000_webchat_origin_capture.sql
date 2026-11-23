-- Chat do site grava a origem completa: todos os UTMs, clique (fbclid/gclid), página e site de origem
-- vão para o contato/oportunidade e viram uma entrada no motor de origens (commercial_capture).
BEGIN;
CREATE OR REPLACE FUNCTION public.promote_session_to_contact(p_session_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session      webchat_sessions%ROWTYPE;
  v_endpoint     communication_endpoints%ROWTYPE;
  v_settings     jsonb;
  v_stage_id     uuid;
  v_phone_norm   text;
  v_phone_digits text;
  v_business_ctx text;
  v_contact_id   uuid;
  v_thread_id    uuid;
  v_name         text;
  v_msg          RECORD;
  v_opp_id       uuid;
  v_new_contact  boolean := false;
BEGIN
  SELECT * INTO v_session FROM webchat_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'webchat session % not found', p_session_id; END IF;
  IF v_session.status = 'promoted' AND v_session.thread_id IS NOT NULL THEN RETURN v_session.thread_id; END IF;
  IF v_session.visitor_phone IS NULL OR length(trim(v_session.visitor_phone)) = 0 THEN
    RAISE EXCEPTION 'cannot promote session % without phone', p_session_id;
  END IF;

  SELECT * INTO v_endpoint FROM communication_endpoints WHERE id = v_session.endpoint_id;
  v_settings := COALESCE(v_endpoint.inbound_settings, '{}'::jsonb);
  v_stage_id := NULLIF(v_settings #>> '{target,pipeline_stage_id}', '')::uuid;
  IF v_stage_id IS NULL THEN
    RAISE EXCEPTION 'webchat endpoint % has no target.pipeline_stage_id configured', v_endpoint.id;
  END IF;

  v_business_ctx := CASE WHEN v_endpoint.purpose = 'customer_service' THEN 'customer_service' ELSE 'sales' END;

  v_phone_digits := regexp_replace(v_session.visitor_phone, '\D', '', 'g');
  IF length(v_phone_digits) IN (10, 11) THEN v_phone_digits := '55' || v_phone_digits; END IF;
  v_phone_norm := normalize_phone_br(v_phone_digits);
  v_name := COALESCE(NULLIF(trim(v_session.visitor_name), ''), 'Lead Webchat');

  SELECT id INTO v_contact_id FROM contacts
  WHERE organization_id = v_session.organization_id AND phone_normalized = v_phone_norm AND deleted_at IS NULL
  ORDER BY created_at ASC LIMIT 1;

  IF v_contact_id IS NULL THEN
    INSERT INTO contacts (organization_id, full_name, phone, source, source_external_id,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, meta_ad_id, landing_url, referrer_url)
    VALUES (v_session.organization_id, v_name, v_phone_norm, 'webchat', v_session.id::text,
            NULLIF(v_session.utm #>> '{utm_source}', ''), NULLIF(v_session.utm #>> '{utm_medium}', ''), NULLIF(v_session.utm #>> '{utm_campaign}', ''),
            NULLIF(v_session.utm #>> '{utm_content}', ''), NULLIF(v_session.utm #>> '{utm_term}', ''),
            NULLIF(COALESCE(v_session.fbclid, v_session.utm #>> '{fbclid}'), ''), NULLIF(v_session.utm #>> '{gclid}', ''), NULLIF(v_session.utm #>> '{meta_ad_id}', ''),
            NULLIF(v_session.landing_url, ''), NULLIF(v_session.referrer, ''))
    RETURNING id INTO v_contact_id;
    v_new_contact := true;
  END IF;

  INSERT INTO opportunities (organization_id, title, pipeline_stage_id, contact_id, source, source_external_id,
    utm_source, utm_medium, utm_campaign, utm_content)
  VALUES (v_session.organization_id, v_name, v_stage_id, v_contact_id, 'webchat', v_session.id::text,
          NULLIF(v_session.utm #>> '{utm_source}', ''), NULLIF(v_session.utm #>> '{utm_medium}', ''), NULLIF(v_session.utm #>> '{utm_campaign}', ''), NULLIF(v_session.utm #>> '{utm_content}', ''))
  RETURNING id INTO v_opp_id;

  SELECT id INTO v_thread_id FROM message_threads
  WHERE organization_id = v_session.organization_id AND contact_id = v_contact_id
    AND channel = 'webchat' AND primary_endpoint_id = v_endpoint.id
    AND status = ANY (ARRAY['open', 'awaiting_client', 'in_progress'])
  ORDER BY created_at DESC LIMIT 1;

  IF v_thread_id IS NULL THEN
    INSERT INTO message_threads (organization_id, contact_id, channel, primary_endpoint_id, status, business_context)
    VALUES (v_session.organization_id, v_contact_id, 'webchat', v_endpoint.id, 'open', v_business_ctx)
    RETURNING id INTO v_thread_id;
  END IF;

  FOR v_msg IN SELECT role, content, created_at FROM webchat_session_messages WHERE session_id = v_session.id ORDER BY created_at ASC
  LOOP
    INSERT INTO messages (organization_id, thread_id, content, direction, sender_type, sender_name, endpoint_id)
    VALUES (v_session.organization_id, v_thread_id, v_msg.content,
      CASE WHEN v_msg.role = 'visitor' THEN 'inbound' ELSE 'outbound' END,
      CASE WHEN v_msg.role = 'visitor' THEN 'contact' WHEN v_msg.role = 'bot' THEN 'agent' ELSE 'system' END,
      CASE WHEN v_msg.role = 'visitor' THEN v_name ELSE COALESCE(v_endpoint.display_name, 'Webchat') END,
      v_endpoint.id);
  END LOOP;

  -- Origem: a visita do chat (UTM, clique, página) vira uma entrada do motor de origens.
  -- Nunca impede a criação do lead.
  BEGIN
    PERFORM commercial_capture(v_session.organization_id, 'webchat:'||v_session.id, v_contact_id, v_opp_id,
      'webchat', COALESCE(v_session.created_at, now()), v_new_contact, true,
      jsonb_strip_nulls(jsonb_build_object('source','webchat',
        'utm_source',commercial_clean(v_session.utm->>'utm_source'),'utm_medium',commercial_clean(v_session.utm->>'utm_medium'),
        'utm_campaign',commercial_clean(v_session.utm->>'utm_campaign'),'utm_content',commercial_clean(v_session.utm->>'utm_content'),
        'utm_term',commercial_clean(v_session.utm->>'utm_term'),'utm_id',commercial_clean(v_session.utm->>'utm_id'),
        'fbclid',commercial_clean(COALESCE(v_session.fbclid, v_session.utm->>'fbclid')),'gclid',commercial_clean(v_session.utm->>'gclid'),'gbraid',commercial_clean(v_session.utm->>'gbraid'),
        'wbraid',commercial_clean(v_session.utm->>'wbraid'),'meta_ad_id',commercial_clean(v_session.utm->>'meta_ad_id'),
        'landing_url',commercial_clean(v_session.landing_url),'referrer_url',commercial_clean(v_session.referrer))),
      NULL, v_endpoint.id, NULL);
  EXCEPTION WHEN others THEN
    RAISE WARNING '[webchat] commercial capture failed for session %: %', v_session.id, SQLERRM;
  END;

  UPDATE webchat_sessions SET status = 'promoted', contact_id = v_contact_id, thread_id = v_thread_id, promoted_at = now()
  WHERE id = v_session.id;

  RETURN v_thread_id;
END;
$function$;
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('20261124100000','webchat_origin_capture') ON CONFLICT DO NOTHING;
COMMIT;
