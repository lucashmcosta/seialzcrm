-- Perder a oportunidade também encerra a conversa.
-- opportunity_loss_settings.close_conversation:
--   never  = como antes;
--   ask    = a tela "Marcar como perdida" mostra "Encerrar a conversa" (marcado) e chama close_conversations_after_loss_v1;
--   always = toda perda (pessoa, agente, robô, API) encerra, pelo trigger.
-- Não encerra quando o contato tem outra oportunidade aberta nem conversa de atendimento (customer_service).
-- Se o cliente voltar a escrever, a conversa reabre como já acontece hoje.
-- Rollback: DROP TRIGGER trg_close_conversation_on_loss ON opportunity_losses;
--           DROP FUNCTION fn_close_conversation_on_loss_v1(), close_conversations_after_loss_v1(uuid, uuid[]),
--             fn_close_conversations_after_loss_internal_v1(uuid, uuid);
--           ALTER TABLE opportunity_loss_settings DROP COLUMN close_conversation;
BEGIN;

ALTER TABLE public.opportunity_loss_settings ADD COLUMN IF NOT EXISTS close_conversation text NOT NULL DEFAULT 'ask';
ALTER TABLE public.opportunity_loss_settings DROP CONSTRAINT IF EXISTS opportunity_loss_settings_close_conversation_check;
ALTER TABLE public.opportunity_loss_settings ADD CONSTRAINT opportunity_loss_settings_close_conversation_check
  CHECK (close_conversation IN ('never', 'ask', 'always'));

CREATE OR REPLACE FUNCTION public.fn_close_conversations_after_loss_internal_v1(_org uuid, _opportunity_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_contact uuid; v_count integer;
BEGIN
  SELECT contact_id INTO v_contact FROM public.opportunities
  WHERE id = _opportunity_id AND organization_id = _org AND status::text = 'lost';
  IF v_contact IS NULL THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.opportunities o WHERE o.organization_id = _org AND o.contact_id = v_contact
             AND o.id <> _opportunity_id AND o.status::text = 'open' AND o.deleted_at IS NULL) THEN
    RETURN 0;
  END IF;
  UPDATE public.message_threads t
  SET status = 'resolved', resolved_at = now()
  WHERE t.organization_id = _org AND t.contact_id = v_contact
    AND t.status NOT IN ('resolved', 'closed') AND t.merged_into_thread_id IS NULL
    AND t.business_context IS DISTINCT FROM 'customer_service';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.fn_close_conversations_after_loss_internal_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_close_conversations_after_loss_internal_v1(uuid, uuid) TO service_role;

-- Chamada pela tela quando a org está em "ask" e a pessoa deixou marcado.
CREATE OR REPLACE FUNCTION public.close_conversations_after_loss_v1(_organization_id uuid, _opportunity_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_total integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT (_organization_id = ANY(public.current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden_organization' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(_opportunity_ids, 1), 0) > 500 THEN
    RAISE EXCEPTION 'too_many_opportunities' USING ERRCODE = '22023';
  END IF;
  FOREACH v_id IN ARRAY coalesce(_opportunity_ids, '{}') LOOP
    v_total := v_total + public.fn_close_conversations_after_loss_internal_v1(_organization_id, v_id);
  END LOOP;
  RETURN v_total;
END $$;
REVOKE ALL ON FUNCTION public.close_conversations_after_loss_v1(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_conversations_after_loss_v1(uuid, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_close_conversation_on_loss_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.opportunity_loss_settings s
             WHERE s.organization_id = NEW.organization_id AND s.close_conversation = 'always') THEN
    PERFORM public.fn_close_conversations_after_loss_internal_v1(NEW.organization_id, NEW.opportunity_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_close_conversation_on_loss_v1() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_close_conversation_on_loss ON public.opportunity_losses;
CREATE TRIGGER trg_close_conversation_on_loss AFTER INSERT ON public.opportunity_losses
FOR EACH ROW EXECUTE FUNCTION public.fn_close_conversation_on_loss_v1();

-- A tela de perda precisa saber se mostra "Encerrar a conversa": mesma função, com close_conversation.
CREATE OR REPLACE FUNCTION public.list_loss_reason_options_v1(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason_required boolean;
  v_detail_mode text;
  v_close text;
  v_reasons jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT (_organization_id = ANY(public.current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden_organization' USING ERRCODE = '42501';
  END IF;
  SELECT s.reason_required, s.detail_mode INTO v_reason_required, v_detail_mode
  FROM public.loss_settings_internal_v1(_organization_id) s;
  SELECT coalesce((SELECT close_conversation FROM public.opportunity_loss_settings WHERE organization_id = _organization_id), 'ask')
  INTO v_close;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'code', r.code, 'name', r.name,
    'details', CASE WHEN v_detail_mode = 'off' THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'code', d.code, 'name', d.name, 'help_text', d.help_text,
        'requires_description', d.requires_description
      ) ORDER BY d.order_index, d.name)
      FROM public.opportunity_loss_reason_details d
      WHERE d.reason_id = r.id AND d.is_active AND NOT d.automation_only
    ), '[]'::jsonb) END
  ) ORDER BY r.order_index, r.name), '[]'::jsonb) INTO v_reasons
  FROM public.opportunity_loss_reasons r
  WHERE r.organization_id = _organization_id AND r.is_active;

  RETURN jsonb_build_object(
    'reason_required', v_reason_required AND jsonb_array_length(v_reasons) > 0,
    'detail_mode', v_detail_mode,
    'close_conversation', v_close,
    'reasons', v_reasons);
END $$;

INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20261126110000', 'loss_close_conversation') ON CONFLICT DO NOTHING;
COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
