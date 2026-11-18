-- Responsável do contato é o principal: ao trocar, opcionalmente passa junto a conversa (comercial,
-- em aberto) e as oportunidades abertas. Tudo numa transação.
-- SECURITY INVOKER: valem as mesmas permissões (RLS + guardas de RBAC) de quem está trocando.
-- Ganhas/perdidas não mudam (histórico e comissões). Conversas do Atendimento não mudam (fila própria).
CREATE OR REPLACE FUNCTION public.rpc_change_contact_owner_v1(
  p_contact_id uuid,
  p_new_owner uuid,
  p_threads boolean DEFAULT true,
  p_opportunities boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_threads integer := 0;
  v_opps integer := 0;
BEGIN
  SELECT organization_id INTO v_org FROM contacts WHERE id = p_contact_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_new_owner IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_organizations WHERE organization_id = v_org AND user_id = p_new_owner AND is_active
  ) THEN
    RAISE EXCEPTION 'owner_not_in_org' USING ERRCODE = '22023';
  END IF;

  UPDATE contacts SET owner_user_id = p_new_owner, updated_by = current_user_id()
  WHERE id = p_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden_contact' USING ERRCODE = '42501'; END IF;

  IF p_threads THEN
    -- Mesma regra do "Atribuir" da conversa.
    UPDATE message_threads SET
      assigned_user_id = p_new_owner,
      assigned_at = CASE WHEN p_new_owner IS NULL THEN NULL ELSE now() END,
      needs_human_attention = (p_new_owner IS NOT NULL)
    WHERE organization_id = v_org AND contact_id = p_contact_id
      AND merged_into_thread_id IS NULL
      AND status NOT IN ('resolved', 'closed')
      AND business_context IS DISTINCT FROM 'customer_service'
      AND assigned_user_id IS DISTINCT FROM p_new_owner;
    GET DIAGNOSTICS v_threads = ROW_COUNT;
  END IF;

  IF p_opportunities THEN
    UPDATE opportunities SET owner_user_id = p_new_owner, updated_by = current_user_id()
    WHERE organization_id = v_org AND contact_id = p_contact_id
      AND status = 'open' AND deleted_at IS NULL
      AND owner_user_id IS DISTINCT FROM p_new_owner;
    GET DIAGNOSTICS v_opps = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'threads', v_threads, 'opportunities', v_opps);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_change_contact_owner_v1(uuid, uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_change_contact_owner_v1(uuid, uuid, boolean, boolean) TO authenticated;
