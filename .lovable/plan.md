## Migration 2A — versão final (com correções)

Não aplicar ainda. SQL pronto para revisão final.

Correções aplicadas vs versão anterior:
1. `assign_round_robin(uuid,text)` trata queue vazia/whitespace como fallback.
2. Trigger de histórico só registra quando `last_routing_decision` está presente (evita poluir com `manual_assignment` falso vindo de UPDATEs externos).
3. `take_over_thread` bloqueia `resolved`/`closed` (reopen vira fluxo separado depois).

---

### SQL completo

```sql
-- ============================================================
-- Migration 2A: history + take_over + reassign + routing base
-- ============================================================

-- 1) Coluna de decisão de roteamento
ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS last_routing_decision jsonb;

-- 2) Overload de assign_round_robin com queue
CREATE OR REPLACE FUNCTION public.assign_round_robin(_org_id uuid, _queue text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_enabled boolean;
  v_user_id uuid;
  v_uo_id uuid;
BEGIN
  -- Fallback total para a função antiga quando queue é NULL ou só whitespace
  IF _queue IS NULL OR btrim(_queue) = '' THEN
    RETURN public.assign_round_robin(_org_id);
  END IF;

  SELECT round_robin_enabled INTO v_enabled
  FROM organizations WHERE id = _org_id;
  IF v_enabled IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT uo.id, uo.user_id
    INTO v_uo_id, v_user_id
  FROM user_organizations uo
  WHERE uo.organization_id = _org_id
    AND uo.is_active = true
    AND uo.round_robin_active = true
    AND _queue = ANY(COALESCE(uo.round_robin_queues, '{}'::text[]))
  ORDER BY uo.last_assigned_at NULLS FIRST, uo.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE user_organizations
     SET last_assigned_at = now()
   WHERE id = v_uo_id;

  RETURN v_user_id;
END;
$$;

-- 3) Trigger central de histórico (só com decisão explícita)
CREATE OR REPLACE FUNCTION public.fn_log_thread_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_decision jsonb;
  v_action   text;
  v_reason   text;
  v_by       uuid;
BEGIN
  IF NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id THEN
    RETURN NEW;
  END IF;

  -- Só registra histórico quando a mudança vier com decisão explícita.
  -- UPDATEs externos sem last_routing_decision não geram linha (evita ruído).
  IF NEW.last_routing_decision IS NULL THEN
    RETURN NEW;
  END IF;

  v_decision := NEW.last_routing_decision;
  v_action   := COALESCE(v_decision->>'action', 'manual_assignment');
  v_reason   := v_decision->>'reason';
  v_by       := NULLIF(v_decision->>'by_user_id','')::uuid;

  INSERT INTO public.thread_assignment_history
    (organization_id, thread_id, action_type,
     from_user_id, to_user_id, performed_by_user_id,
     reason, metadata)
  VALUES
    (NEW.organization_id, NEW.id, v_action,
     OLD.assigned_user_id, NEW.assigned_user_id,
     COALESCE(v_by, NEW.assigned_user_id),
     v_reason, v_decision);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_thread_assignment_change ON public.message_threads;
CREATE TRIGGER trg_log_thread_assignment_change
AFTER UPDATE OF assigned_user_id ON public.message_threads
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_thread_assignment_change();

-- 4) RPC take_over_thread (bloqueia resolved/closed)
CREATE OR REPLACE FUNCTION public.take_over_thread(_thread_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := public.current_user_id();
  v_org     uuid;
  v_status  text;
  v_allowed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT organization_id, status
    INTO v_org, v_status
  FROM public.message_threads
  WHERE id = _thread_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'thread_not_found';
  END IF;

  IF NOT (v_org = ANY(public.current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden_org';
  END IF;

  -- Takeover não reabre thread fechada. Reopen será fluxo separado.
  IF v_status IN ('resolved','closed') THEN
    RAISE EXCEPTION 'thread_closed_reopen_required';
  END IF;

  SELECT COALESCE((pp.permissions->>'can_takeover_thread')::bool, false)
         OR COALESCE((pp.permissions->>'manage_assignments')::bool, false)
    INTO v_allowed
  FROM user_organizations uo
  JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
  WHERE uo.user_id = v_uid
    AND uo.organization_id = v_org
    AND uo.is_active;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'forbidden_permission';
  END IF;

  UPDATE public.message_threads SET
    last_routing_decision = jsonb_build_object(
      'action',      'take_over',
      'reason',      _reason,
      'by_user_id',  v_uid,
      'decided_at',  now()
    ),
    assigned_user_id = v_uid,
    assigned_at      = now(),
    status           = 'in_progress'
  WHERE id = _thread_id;

  RETURN jsonb_build_object('ok', true, 'thread_id', _thread_id);
END;
$$;

REVOKE ALL ON FUNCTION public.take_over_thread(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.take_over_thread(uuid,text) TO authenticated;

-- 5) RPC reassign_thread
CREATE OR REPLACE FUNCTION public.reassign_thread(_thread_id uuid, _to_user_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid        uuid := public.current_user_id();
  v_org        uuid;
  v_status     text;
  v_allowed    boolean;
  v_target_ok  boolean;
  v_new_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT organization_id, status
    INTO v_org, v_status
  FROM public.message_threads
  WHERE id = _thread_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'thread_not_found';
  END IF;

  IF NOT (v_org = ANY(public.current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden_org';
  END IF;

  SELECT COALESCE((pp.permissions->>'manage_assignments')::bool, false)
         OR COALESCE((pp.permissions->>'can_manage_cs_queue')::bool, false)
    INTO v_allowed
  FROM user_organizations uo
  JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
  WHERE uo.user_id = v_uid
    AND uo.organization_id = v_org
    AND uo.is_active;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'forbidden_permission';
  END IF;

  SELECT true INTO v_target_ok
  FROM user_organizations
  WHERE user_id = _to_user_id
    AND organization_id = v_org
    AND is_active;

  IF NOT COALESCE(v_target_ok, false) THEN
    RAISE EXCEPTION 'invalid_target_user';
  END IF;

  IF v_status IN ('resolved','closed') THEN
    RAISE EXCEPTION 'thread_closed_reopen_required';
  END IF;

  v_new_status := CASE
    WHEN v_status = 'open'            THEN 'in_progress'
    WHEN v_status = 'awaiting_client' THEN 'awaiting_client'
    ELSE v_status
  END;

  UPDATE public.message_threads SET
    last_routing_decision = jsonb_build_object(
      'action',     'manual_assignment',
      'reason',     _reason,
      'by_user_id', v_uid,
      'decided_at', now()
    ),
    assigned_user_id = _to_user_id,
    assigned_at      = now(),
    status           = v_new_status
  WHERE id = _thread_id;

  RETURN jsonb_build_object('ok', true, 'thread_id', _thread_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_thread(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_thread(uuid,uuid,text) TO authenticated;

-- 6) Routing helper por purpose
CREATE OR REPLACE FUNCTION public.get_default_queue_for_thread(_thread_id uuid)
RETURNS TABLE(queue text, suggested_user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purpose       text;
  v_endpoint_user uuid;
BEGIN
  SELECT ce.purpose, ce.assigned_user_id
    INTO v_purpose, v_endpoint_user
  FROM message_threads t
  LEFT JOIN communication_endpoints ce ON ce.id = t.primary_endpoint_id
  WHERE t.id = _thread_id;

  IF v_purpose = 'customer_service' THEN
    RETURN QUERY SELECT 'customer_service'::text, NULL::uuid;
  ELSIF v_purpose = 'vendor_personal' THEN
    RETURN QUERY SELECT 'commercial'::text, v_endpoint_user;  -- pode ser NULL
  ELSE
    -- commercial, other, NULL → commercial
    RETURN QUERY SELECT 'commercial'::text, NULL::uuid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_default_queue_for_thread(uuid) TO authenticated;
```

---

### Explicação de cada peça

- **`last_routing_decision jsonb`**: única fonte de verdade da decisão. O trigger só dispara histórico se ela estiver presente — qualquer UPDATE em `assigned_user_id` feito sem setar este campo (ex.: edge function antiga, fix manual no SQL Editor) não polui o histórico com `manual_assignment` falso.
- **`assign_round_robin(uuid,text)`**: novo overload. Queue NULL ou whitespace → delega ao 1-arg (zero regressão). Queue válida → filtra por `round_robin_queues @> ARRAY[_queue]` via `= ANY(...)`, mantendo `FOR UPDATE SKIP LOCKED` e a mesma ordenação `last_assigned_at NULLS FIRST, id`.
- **`fn_log_thread_assignment_change`**: AFTER UPDATE OF `assigned_user_id`. Sai cedo se o assignee não mudou. Sai cedo se `last_routing_decision IS NULL`. Caso contrário grava 1 linha com `action`, `reason`, `by_user_id` extraídos do JSON.
- **`take_over_thread`**: requer `current_user_id()`, valida org, bloqueia `resolved`/`closed`, exige `can_takeover_thread` ou `manage_assignments`. Seta decisão + assignee + `in_progress`. Histórico vem do trigger.
- **`reassign_thread`**: idem com `manage_assignments` ou `can_manage_cs_queue`, valida usuário-alvo na mesma org/ativo, preserva `awaiting_client`, promove `open` → `in_progress`.
- **`get_default_queue_for_thread`**: apenas leitura — devolve queue padrão e `suggested_user_id` (vendor_personal). Webhook NÃO é alterado nesta migration.

---

### Triggers/funções preservados

Não recriar nem alterar: `threads_round_robin` (BEFORE INSERT), `trg_handoff_notification`, `update_message_threads_updated_at`. `trg_messages_smart_reopen`, `trg_inbound_message_status`, `fn_calc_message_response_time`, `handle_handoff_notification` ficam intocadas. Qualquer alteração futura virá com diff antes.

---

### Smoke tests (rodar pós-apply, fora da migration)

1. `SELECT public.assign_round_robin('<org>');` → comportamento idêntico ao atual.
2. `SELECT public.assign_round_robin('<org>', NULL);` e `SELECT public.assign_round_robin('<org>', '   ');` → caem no fallback (mesmo resultado do item 1).
3. `SELECT public.assign_round_robin('<org>', 'customer_service');` → só sorteia usuários com `'customer_service' = ANY(round_robin_queues)`.
4. `UPDATE message_threads SET assigned_user_id = '<x>' WHERE id = '<t>';` (sem decisão) → **NÃO** cria linha em `thread_assignment_history`.
5. `SELECT public.take_over_thread('<thread_open>', 'teste');` autenticado com permissão → `assigned_user_id` muda, `status='in_progress'`, +1 linha com `action_type='take_over'`.
6. `take_over_thread` em thread `resolved` ou `closed` → `thread_closed_reopen_required`.
7. `take_over_thread` sem `can_takeover_thread`/`manage_assignments` → `forbidden_permission`.
8. `reassign_thread` com alvo de outra org → `invalid_target_user`. Com alvo válido: `awaiting_client` preserva, `open` vira `in_progress`, `resolved` erra.
9. Contagem antes/depois de cada RPC: exatamente +1 linha em `thread_assignment_history`.
10. UI `/messages` (Fase 0): thread em `in_progress` aparece em Todas/Minhas com badge azul.

---

### Riscos remanescentes

- **Edge functions futuras** que mudarem `assigned_user_id` sem setar `last_routing_decision` ficarão fora do histórico. É intencional — força chamadas explícitas via RPC ou seteo manual da decisão. Documentar no handover para times de edge.
- **`take_over_thread` em thread `resolved`/`closed`** agora exige reopen explícito (a definir na 2B/2C). Confirmar com produto que esse é o fluxo desejado para casos de "cliente voltou após resolver".
- **`get_default_queue_for_thread` retorna `suggested_user_id` mesmo quando NULL para vendor_personal**. Caller precisa tratar (fallback round-robin commercial). Não há consumidor ainda, então sem impacto agora.

---

### Rollback

```sql
DROP TRIGGER IF EXISTS trg_log_thread_assignment_change ON public.message_threads;
DROP FUNCTION IF EXISTS public.fn_log_thread_assignment_change();
DROP FUNCTION IF EXISTS public.take_over_thread(uuid, text);
DROP FUNCTION IF EXISTS public.reassign_thread(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.get_default_queue_for_thread(uuid);
DROP FUNCTION IF EXISTS public.assign_round_robin(uuid, text);
ALTER TABLE public.message_threads DROP COLUMN IF EXISTS last_routing_decision;
```

`assign_round_robin(uuid)` original não é tocada — segue intacta.
