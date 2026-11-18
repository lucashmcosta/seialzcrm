-- Transferência da carteira de um usuário (ao desativar, ou depois para quem já saiu).
-- Unidade = contato: cada contato vai inteiro para uma pessoa, junto com a conversa comercial em aberto
-- e as oportunidades abertas dele. Item de contato que é de outra pessoa (ativa) vai para o dono do contato.
-- Ganhas/perdidas e conversas encerradas não mudam. Conversas do Atendimento voltam para a fila.
-- Só administrador da org (SECURITY DEFINER + is_org_system_admin).

CREATE OR REPLACE FUNCTION public.rpc_user_portfolio_summary_v1(p_organization_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_org_system_admin(p_organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'contacts', (SELECT count(*) FROM contacts WHERE organization_id = p_organization_id AND deleted_at IS NULL AND owner_user_id = p_user_id),
    'threads', (SELECT count(*) FROM message_threads WHERE organization_id = p_organization_id AND merged_into_thread_id IS NULL
                  AND status NOT IN ('resolved','closed') AND assigned_user_id = p_user_id),
    'opportunities', (SELECT count(*) FROM opportunities WHERE organization_id = p_organization_id AND deleted_at IS NULL
                  AND status = 'open' AND owner_user_id = p_user_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_transfer_user_portfolio_v1(
  p_organization_id uuid,
  p_from_user uuid,
  p_mode text,                  -- 'single' | 'split' | 'none'
  p_targets uuid[] DEFAULT '{}',
  p_batch_size integer DEFAULT 500,
  p_offset integer DEFAULT 0    -- quantos contatos já foram distribuídos (continua o rodízio entre lotes)
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
-- Em LOTES: cada chamada move até p_batch_size contatos (com suas conversas e oportunidades) e, quando
-- não restam contatos, até p_batch_size itens soltos. A tela chama de novo até 'remaining' = 0.
-- Lotes curtos evitam travar milhares de conversas enquanto mensagens chegam.
DECLARE
  v_targets uuid[];
  v_n integer;
  v_batch integer := least(greatest(coalesce(p_batch_size, 500), 1), 2000);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_actor uuid := current_user_id();
  v_contacts integer := 0;
  v_threads integer := 0;
  v_cs_threads integer := 0;
  v_opps integer := 0;
  v_rem_contacts integer;
  v_remaining integer;
BEGIN
  IF NOT public.is_org_system_admin(p_organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('single','split','none') THEN RAISE EXCEPTION 'invalid_mode' USING ERRCODE = '22023'; END IF;

  -- Transferência em massa: não publica milhares de eventos de integração (dono é dado interno).
  PERFORM set_config('app.skip_event_emit', 'true', true);

  -- Destinos válidos: membros ativos da org, diferentes de quem sai, sem repetição, na ordem dada.
  SELECT array_agg(t ORDER BY ord) INTO v_targets
  FROM (SELECT DISTINCT ON (t) t, ord FROM unnest(coalesce(p_targets,'{}')) WITH ORDINALITY AS u(t, ord) ORDER BY t, ord) x
  WHERE t <> p_from_user AND EXISTS (
    SELECT 1 FROM user_organizations uo WHERE uo.organization_id = p_organization_id AND uo.user_id = x.t AND uo.is_active);
  v_n := coalesce(cardinality(v_targets), 0);
  IF p_mode = 'none' THEN v_targets := '{}'; v_n := 0;
  ELSIF v_n = 0 THEN RAISE EXCEPTION 'no_valid_targets' USING ERRCODE = '22023';
  ELSIF p_mode = 'single' THEN v_targets := v_targets[1:1]; v_n := 1;
  END IF;

  -- 1) Lote de contatos, em rodízio (mais recentes primeiro) continuando de p_offset.
  DROP TABLE IF EXISTS _portfolio_map;
  CREATE TEMP TABLE _portfolio_map ON COMMIT DROP AS
  SELECT b.id AS contact_id,
         CASE WHEN v_n = 0 THEN NULL::uuid
              ELSE v_targets[1 + ((v_off + b.rn - 1) % v_n)::int] END AS new_owner
  FROM (
    SELECT c.id, row_number() OVER (ORDER BY c.updated_at DESC NULLS LAST, c.id) AS rn
    FROM contacts c
    WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL AND c.owner_user_id = p_from_user
    ORDER BY c.updated_at DESC NULLS LAST, c.id
    LIMIT v_batch
  ) b;

  UPDATE contacts c SET owner_user_id = m.new_owner, updated_by = v_actor
  FROM _portfolio_map m WHERE c.id = m.contact_id;
  GET DIAGNOSTICS v_contacts = ROW_COUNT;

  SELECT count(*) INTO v_rem_contacts FROM contacts
  WHERE organization_id = p_organization_id AND deleted_at IS NULL AND owner_user_id = p_from_user;

  -- 2) Conversas comerciais em aberto da pessoa que sai.
  --    Do contato deste lote → novo dono do contato. Depois que acabam os contatos, as soltas:
  --    contato de outra pessoa ativa → esse dono; senão → rodízio (ou fila, no modo 'none').
  --    needs_human_attention nunca é ligado aqui (evita milhares de notificações de uma vez).
  WITH item AS (
    SELECT t.id, t.contact_id, row_number() OVER (ORDER BY t.last_message_at DESC NULLS LAST, t.id) AS rn
    FROM message_threads t
    LEFT JOIN _portfolio_map m ON m.contact_id = t.contact_id
    WHERE t.organization_id = p_organization_id AND t.merged_into_thread_id IS NULL
      AND t.status NOT IN ('resolved','closed') AND t.assigned_user_id = p_from_user
      AND t.business_context IS DISTINCT FROM 'customer_service'
      AND (m.contact_id IS NOT NULL OR v_rem_contacts = 0)
    ORDER BY (m.contact_id IS NULL), t.last_message_at DESC NULLS LAST, t.id
    LIMIT v_batch * 4
  ), dest AS (
    SELECT i.id,
      CASE
        WHEN m.contact_id IS NOT NULL THEN m.new_owner
        WHEN c.owner_user_id IS NOT NULL AND c.owner_user_id <> p_from_user AND EXISTS (
          SELECT 1 FROM user_organizations uo WHERE uo.organization_id = p_organization_id AND uo.user_id = c.owner_user_id AND uo.is_active)
          THEN c.owner_user_id
        WHEN v_n = 0 THEN NULL::uuid
        ELSE v_targets[1 + ((v_off + i.rn - 1) % v_n)::int]
      END AS new_owner
    FROM item i
    LEFT JOIN _portfolio_map m ON m.contact_id = i.contact_id
    LEFT JOIN contacts c ON c.id = i.contact_id
  )
  UPDATE message_threads t SET
    assigned_user_id = d.new_owner,
    assigned_at = CASE WHEN d.new_owner IS NULL THEN NULL ELSE now() END,
    needs_human_attention = CASE WHEN d.new_owner IS NULL THEN false ELSE t.needs_human_attention END
  FROM dest d WHERE t.id = d.id;
  GET DIAGNOSTICS v_threads = ROW_COUNT;

  -- Atendimento: volta para a fila (a distribuição do suporte cuida). Só quando acabam os contatos.
  IF v_rem_contacts = 0 THEN
    UPDATE message_threads SET assigned_user_id = NULL, assigned_at = NULL
    WHERE id IN (
      SELECT id FROM message_threads
      WHERE organization_id = p_organization_id AND merged_into_thread_id IS NULL
        AND status NOT IN ('resolved','closed') AND assigned_user_id = p_from_user
        AND business_context = 'customer_service'
      LIMIT v_batch * 4);
    GET DIAGNOSTICS v_cs_threads = ROW_COUNT;
  END IF;

  -- 3) Oportunidades abertas (mesma regra das conversas).
  WITH item AS (
    SELECT o.id, o.contact_id, row_number() OVER (ORDER BY o.updated_at DESC NULLS LAST, o.id) AS rn
    FROM opportunities o
    LEFT JOIN _portfolio_map m ON m.contact_id = o.contact_id
    WHERE o.organization_id = p_organization_id AND o.deleted_at IS NULL AND o.status = 'open'
      AND o.owner_user_id = p_from_user
      AND (m.contact_id IS NOT NULL OR v_rem_contacts = 0)
    ORDER BY (m.contact_id IS NULL), o.updated_at DESC NULLS LAST, o.id
    LIMIT v_batch * 4
  ), dest AS (
    SELECT i.id,
      CASE
        WHEN m.contact_id IS NOT NULL THEN m.new_owner
        WHEN c.owner_user_id IS NOT NULL AND c.owner_user_id <> p_from_user AND EXISTS (
          SELECT 1 FROM user_organizations uo WHERE uo.organization_id = p_organization_id AND uo.user_id = c.owner_user_id AND uo.is_active)
          THEN c.owner_user_id
        WHEN v_n = 0 THEN NULL::uuid
        ELSE v_targets[1 + ((v_off + i.rn - 1) % v_n)::int]
      END AS new_owner
    FROM item i
    LEFT JOIN _portfolio_map m ON m.contact_id = i.contact_id
    LEFT JOIN contacts c ON c.id = i.contact_id
  )
  UPDATE opportunities o SET owner_user_id = d.new_owner, updated_by = v_actor
  FROM dest d WHERE o.id = d.id;
  GET DIAGNOSTICS v_opps = ROW_COUNT;

  SELECT v_rem_contacts
    + (SELECT count(*) FROM message_threads WHERE organization_id = p_organization_id AND merged_into_thread_id IS NULL
         AND status NOT IN ('resolved','closed') AND assigned_user_id = p_from_user)
    + (SELECT count(*) FROM opportunities WHERE organization_id = p_organization_id AND deleted_at IS NULL
         AND status = 'open' AND owner_user_id = p_from_user)
  INTO v_remaining;

  RETURN jsonb_build_object('ok', true, 'contacts', v_contacts, 'threads', v_threads,
    'support_threads_to_queue', v_cs_threads, 'opportunities', v_opps,
    'next_offset', v_off + v_contacts, 'remaining', v_remaining);
END;
$function$;

DROP FUNCTION IF EXISTS public.rpc_transfer_user_portfolio_v1(uuid, uuid, text, uuid[]);

REVOKE ALL ON FUNCTION public.rpc_user_portfolio_summary_v1(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_transfer_user_portfolio_v1(uuid, uuid, text, uuid[], integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_user_portfolio_summary_v1(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_transfer_user_portfolio_v1(uuid, uuid, text, uuid[], integer, integer) TO authenticated;
