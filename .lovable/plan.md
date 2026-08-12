# Teste Sintético — Unmerge Parcial de Star Merge (bloco final, NÃO executado)

Correções aplicadas conforme as 5 exigências:

1. **Setup completo**: `primary_endpoint_id` distinto em A/B/C, usando 3 `communication_endpoints` reais da MESMA org, `channel='whatsapp'`, apenas como FK (nenhum UPDATE neles). Se a org não tiver 3 endpoints compatíveis + 3 usuários → `SETUP_UNSUITABLE_ORG` e para.
2. **S4 não rebaixado**: comparação explícita S4 vs S0 nos 12 campos, gerando `S4_DIFF_FROM_S0`. Nada é declarado "nota conhecida"; divergência é reportada como divergência (sem correção automática).
3. **S3 com assertions reais** nos 12 campos, incluindo `assigned_at`, `last_message_at`, `last_message_content`, `last_message_direction`.
4. **Relatório S4**: mensagens de A, restauração de B e C, zero auditorias ativas, e o diff campo a campo.
5. **Limpeza**: sem `FUNCTION_PLACEHOLDER`, sem `CREATE TEMP TABLE _snap`. Tudo em uma única transação abortada de propósito (`RAISE EXCEPTION` final carrega o relatório JSON).

Dados confirmados em leitura read-only prévia: existem 2 orgs com ≥3 endpoints `whatsapp` (`40ae935c…a95f` com 10 e `b246ef6f…2896a` com 10) e ambas com ≥19 usuários; índices únicos legados exigem mesmo `primary_endpoint_id` distinto por thread aberta do mesmo contato; `merge_sales_threads(p_winner, p_loser, p_batch)` e `unmerge_message_thread(p_loser)`.

## Bloco final

```sql
DO $$
DECLARE
  v_org uuid; v_ep_a uuid; v_ep_b uuid; v_ep_c uuid;
  v_u1 uuid; v_u2 uuid; v_u3 uuid;
  v_contact uuid; v_a uuid; v_b uuid; v_c uuid;
  v_ma uuid; v_mb uuid; v_mc uuid;
  v_batch1 uuid := gen_random_uuid(); v_batch2 uuid := gen_random_uuid();
  v_t0 timestamptz := now();

  s0 jsonb; s1 jsonb; s2 jsonb; s3 jsonb; s4 jsonb;
  b0 jsonb; c0 jsonb; b4 jsonb; c4 jsonb;
  diff jsonb := '{}'::jsonb;
  fails jsonb := '[]'::jsonb;
  rep jsonb;
  k text;
  v_msgs_a int; v_msgs_b int; v_msgs_c int; v_active_audits int;
  v_hist_after_merges int; v_hist_after_unmerges int;
BEGIN
  -- 0) Escolha e validação da org sintética (somente leitura sobre dados reais)
  SELECT ce.organization_id INTO v_org
  FROM public.communication_endpoints ce
  WHERE ce.channel = 'whatsapp'
  GROUP BY ce.organization_id
  HAVING count(*) >= 3
     AND (SELECT count(DISTINCT uo.user_id) FROM public.user_organizations uo
          WHERE uo.organization_id = ce.organization_id) >= 3
  ORDER BY count(*) DESC
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'SETUP_UNSUITABLE_ORG: nenhuma org com 3 endpoints whatsapp + 3 usuarios';
  END IF;

  SELECT a, b, c INTO v_ep_a, v_ep_b, v_ep_c
  FROM (
    SELECT max(CASE WHEN rn=1 THEN id END) a,
           max(CASE WHEN rn=2 THEN id END) b,
           max(CASE WHEN rn=3 THEN id END) c
    FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) rn
          FROM public.communication_endpoints
          WHERE organization_id = v_org AND channel = 'whatsapp') t
    WHERE rn <= 3
  ) x;

  IF v_ep_a IS NULL OR v_ep_b IS NULL OR v_ep_c IS NULL
     OR v_ep_a = v_ep_b OR v_ep_a = v_ep_c OR v_ep_b = v_ep_c THEN
    RAISE EXCEPTION 'SETUP_ENDPOINTS_INVALID';
  END IF;

  PERFORM 1 FROM public.communication_endpoints
   WHERE id IN (v_ep_a, v_ep_b, v_ep_c) AND organization_id = v_org AND channel='whatsapp'
   HAVING count(*) = 3;
  IF NOT FOUND THEN RAISE EXCEPTION 'SETUP_ENDPOINTS_ORG_MISMATCH'; END IF;

  -- Usuarios: deduplicar PRIMEIRO, numerar DEPOIS
  SELECT u1,u2,u3 INTO v_u1, v_u2, v_u3
  FROM (
    SELECT max(CASE WHEN rn=1 THEN user_id END) u1,
           max(CASE WHEN rn=2 THEN user_id END) u2,
           max(CASE WHEN rn=3 THEN user_id END) u3
    FROM (
      SELECT user_id, row_number() OVER (ORDER BY user_id) rn
      FROM (
        SELECT DISTINCT user_id
        FROM public.user_organizations
        WHERE organization_id = v_org
      ) d
    ) x
    WHERE rn <= 3
  ) y;

  IF v_u1 IS NULL OR v_u2 IS NULL OR v_u3 IS NULL
     OR v_u1 = v_u2 OR v_u1 = v_u3 OR v_u2 = v_u3 THEN
    RAISE EXCEPTION 'SETUP_USERS_INVALID';
  END IF;


  -- 1) Dados sintéticos
  INSERT INTO public.contacts (organization_id, name)
  VALUES (v_org, '__GMUD_STAR_UNMERGE_TEST__')
  RETURNING id INTO v_contact;

  INSERT INTO public.message_threads
    (organization_id, contact_id, channel, business_context, primary_endpoint_id,
     status, priority, assigned_user_id, assigned_at, original_owner_user_id,
     needs_human_attention, created_at, updated_at)
  VALUES (v_org, v_contact, 'whatsapp', 'sales', v_ep_a,
          'resolved', 'normal', v_u1, now() - interval '30 min', v_u1,
          false, now() - interval '3 hour', now() - interval '3 hour')
  RETURNING id INTO v_a;
  UPDATE public.message_threads SET resolved_at = now() - interval '20 min' WHERE id = v_a;

  INSERT INTO public.message_threads
    (organization_id, contact_id, channel, business_context, primary_endpoint_id,
     status, priority, assigned_user_id, assigned_at, original_owner_user_id,
     needs_human_attention, created_at, updated_at)
  VALUES (v_org, v_contact, 'whatsapp', 'sales', v_ep_b,
          'awaiting_client', 'high', v_u2, now() - interval '20 min', v_u2,
          false, now() - interval '2 hour', now() - interval '2 hour')
  RETURNING id INTO v_b;

  INSERT INTO public.message_threads
    (organization_id, contact_id, channel, business_context, primary_endpoint_id,
     status, priority, assigned_user_id, assigned_at, original_owner_user_id,
     needs_human_attention, created_at, updated_at)
  VALUES (v_org, v_contact, 'whatsapp', 'sales', v_ep_c,
          'open', 'normal', v_u3, now() - interval '10 min', v_u3,
          true, now() - interval '1 hour', now() - interval '1 hour')
  RETURNING id INTO v_c;

  INSERT INTO public.messages (organization_id, thread_id, direction, content, sent_at, created_at)
  VALUES (v_org, v_a, 'inbound', 'MSG_A', now() - interval '3 hour', now() - interval '3 hour')
  RETURNING id INTO v_ma;
  INSERT INTO public.messages (organization_id, thread_id, direction, content, sent_at, created_at)
  VALUES (v_org, v_b, 'outbound', 'MSG_B', now() - interval '2 hour', now() - interval '2 hour')
  RETURNING id INTO v_mb;
  INSERT INTO public.messages (organization_id, thread_id, direction, content, sent_at, created_at)
  VALUES (v_org, v_c, 'inbound', 'MSG_C', now() - interval '1 hour', now() - interval '1 hour')
  RETURNING id INTO v_mc;

  -- 1b) BASELINE EXPLICITA pos-triggers (neutraliza messages_smart_reopen e afins).
  -- Preserva os last_message_* gerados pelas mensagens.
  UPDATE public.message_threads SET
    status = 'resolved',
    assigned_user_id = v_u1,
    original_owner_user_id = v_u1,
    assigned_at = v_t0 - interval '30 min',
    resolved_at = v_t0 - interval '20 min',
    priority = 'normal',
    needs_human_attention = false
  WHERE id = v_a;

  UPDATE public.message_threads SET
    status = 'awaiting_client',
    assigned_user_id = v_u2,
    original_owner_user_id = v_u2,
    assigned_at = v_t0 - interval '20 min',
    resolved_at = NULL,
    priority = 'high',
    needs_human_attention = false
  WHERE id = v_b;

  UPDATE public.message_threads SET
    status = 'open',
    assigned_user_id = v_u3,
    original_owner_user_id = v_u3,
    assigned_at = v_t0 - interval '10 min',
    resolved_at = NULL,
    priority = 'normal',
    needs_human_attention = true
  WHERE id = v_c;

  -- confirma que a baseline sobreviveu aos triggers de UPDATE
  IF (SELECT status FROM public.message_threads WHERE id = v_a) <> 'resolved'
     OR (SELECT status FROM public.message_threads WHERE id = v_b) <> 'awaiting_client'
     OR (SELECT status FROM public.message_threads WHERE id = v_c) <> 'open' THEN
    RAISE EXCEPTION 'SETUP_BASELINE_NOT_STABLE';
  END IF;

  -- 2) S0 (A, B, C baseline, antes de qualquer merge)

  SELECT to_jsonb(t) INTO s0 FROM (
    SELECT status, assigned_user_id, assigned_at, original_owner_user_id,
           last_message_id, last_message_at, last_message_content, last_message_direction,
           resolved_at, priority, category_id, needs_human_attention,
           merged_into_thread_id
    FROM public.message_threads WHERE id = v_a) t;
  SELECT to_jsonb(t) INTO b0 FROM (
    SELECT status, assigned_user_id, assigned_at, original_owner_user_id,
           last_message_id, last_message_at, last_message_content, last_message_direction,
           resolved_at, priority, category_id, needs_human_attention, merged_into_thread_id
    FROM public.message_threads WHERE id = v_b) t;
  SELECT to_jsonb(t) INTO c0 FROM (
    SELECT status, assigned_user_id, assigned_at, original_owner_user_id,
           last_message_id, last_message_at, last_message_content, last_message_direction,
           resolved_at, priority, category_id, needs_human_attention, merged_into_thread_id
    FROM public.message_threads WHERE id = v_c) t;

  -- 3) S1 = B -> A
  PERFORM public.merge_sales_threads(v_a, v_b, v_batch1);
  SELECT to_jsonb(t) INTO s1 FROM (
    SELECT status, assigned_user_id, assigned_at, original_owner_user_id,
           last_message_id, last_message_at, last_message_content, last_message_direction,
           resolved_at, priority, category_id, needs_human_attention, merged_into_thread_id
    FROM public.message_threads WHERE id = v_a) t;

  -- 4) S2 = C -> A (estrela)
  PERFORM public.merge_sales_threads(v_a, v_c, v_batch2);
  SELECT to_jsonb(t) INTO s2 FROM (
    SELECT status, assigned_user_id, assigned_at, original_owner_user_id,
           last_message_id, last_message_at, last_message_content, last_message_direction,
           resolved_at, priority, category_id, needs_human_attention, merged_into_thread_id
    FROM public.message_threads WHERE id = v_a) t;

  SELECT count(*) INTO v_hist_after_merges
  FROM public.thread_assignment_history WHERE thread_id IN (v_a, v_b, v_c);

  -- 5) S3 = unmerge(B); C -> A permanece ativo
  PERFORM public.unmerge_message_thread(v_b);
  SELECT to_jsonb(t) INTO s3 FROM (
    SELECT status, assigned_user_id, assigned_at, original_owner_user_id,
           last_message_id, last_message_at, last_message_content, last_message_direction,
           resolved_at, priority, category_id, needs_human_attention, merged_into_thread_id
    FROM public.message_threads WHERE id = v_a) t;

  -- assertions S3 (12 campos, coerência A+C com C->A ativo)
  IF (SELECT thread_id FROM public.messages WHERE id = v_ma) <> v_a THEN
    fails := fails || '["S3_MSG_A_NOT_IN_A"]'::jsonb; END IF;
  IF (SELECT thread_id FROM public.messages WHERE id = v_mb) <> v_b THEN
    fails := fails || '["S3_MSG_B_NOT_RESTORED_TO_B"]'::jsonb; END IF;
  IF (SELECT thread_id FROM public.messages WHERE id = v_mc) <> v_a THEN
    fails := fails || '["S3_MSG_C_LOST_FROM_A"]'::jsonb; END IF;
  IF (SELECT merged_into_thread_id FROM public.message_threads WHERE id = v_b) IS NOT NULL THEN
    fails := fails || '["S3_B_STILL_MERGED"]'::jsonb; END IF;
  IF (SELECT merged_into_thread_id FROM public.message_threads WHERE id = v_c) <> v_a THEN
    fails := fails || '["S3_C_LINK_BROKEN"]'::jsonb; END IF;
  IF (s3->>'last_message_id') IS DISTINCT FROM v_mc::text THEN
    fails := fails || '["S3_LAST_MESSAGE_ID_NOT_C"]'::jsonb; END IF;
  IF (s3->>'last_message_content') IS DISTINCT FROM 'MSG_C' THEN
    fails := fails || '["S3_LAST_MESSAGE_CONTENT_NOT_C"]'::jsonb; END IF;
  IF (s3->>'last_message_direction') IS DISTINCT FROM 'inbound' THEN
    fails := fails || '["S3_LAST_MESSAGE_DIRECTION_NOT_C"]'::jsonb; END IF;
  IF (s3->>'last_message_at') IS DISTINCT FROM (s2->>'last_message_at') THEN
    fails := fails || '["S3_LAST_MESSAGE_AT_DIVERGED_FROM_S2"]'::jsonb; END IF;
  IF (s3->>'assigned_user_id') IS DISTINCT FROM (s2->>'assigned_user_id') THEN
    fails := fails || '["S3_ASSIGNED_USER_DIVERGED_FROM_S2"]'::jsonb; END IF;
  IF (s3->>'assigned_at') IS DISTINCT FROM (s2->>'assigned_at') THEN
    fails := fails || '["S3_ASSIGNED_AT_DIVERGED_FROM_S2"]'::jsonb; END IF;
  IF (s3->>'status') IS DISTINCT FROM (s2->>'status') THEN
    fails := fails || '["S3_STATUS_DIVERGED_FROM_S2"]'::jsonb; END IF;
  IF (s3->>'priority') IS DISTINCT FROM (s2->>'priority') THEN
    fails := fails || '["S3_PRIORITY_DIVERGED_FROM_S2"]'::jsonb; END IF;
  IF (s3->>'category_id') IS DISTINCT FROM (s2->>'category_id') THEN
    fails := fails || '["S3_CATEGORY_DIVERGED_FROM_S2"]'::jsonb; END IF;
  IF (s3->>'needs_human_attention') IS DISTINCT FROM (s2->>'needs_human_attention') THEN
    fails := fails || '["S3_NEEDS_HUMAN_DIVERGED_FROM_S2"]'::jsonb; END IF;
  IF (s3->>'resolved_at') IS DISTINCT FROM (s2->>'resolved_at') THEN
    fails := fails || '["S3_RESOLVED_AT_DIVERGED_FROM_S2"]'::jsonb; END IF;
  IF (s3->>'original_owner_user_id') IS DISTINCT FROM (s0->>'original_owner_user_id') THEN
    fails := fails || '["S3_ORIGINAL_OWNER_CHANGED"]'::jsonb; END IF;
  IF (SELECT count(*) FROM public.message_thread_merge_audit
      WHERE loser_thread_id = v_b AND unmerged_at IS NULL) <> 0 THEN
    fails := fails || '["S3_AUDIT_B_STILL_ACTIVE"]'::jsonb; END IF;
  IF (SELECT count(*) FROM public.message_thread_merge_audit
      WHERE loser_thread_id = v_c AND unmerged_at IS NULL) <> 1 THEN
    fails := fails || '["S3_AUDIT_C_NOT_ACTIVE"]'::jsonb; END IF;

  -- 6) S4 = unmerge(C); nenhum merge ativo sobre A
  PERFORM public.unmerge_message_thread(v_c);
  SELECT to_jsonb(t) INTO s4 FROM (
    SELECT status, assigned_user_id, assigned_at, original_owner_user_id,
           last_message_id, last_message_at, last_message_content, last_message_direction,
           resolved_at, priority, category_id, needs_human_attention, merged_into_thread_id
    FROM public.message_threads WHERE id = v_a) t;
  SELECT to_jsonb(t) INTO b4 FROM (
    SELECT status, assigned_user_id, assigned_at, merged_into_thread_id
    FROM public.message_threads WHERE id = v_b) t;
  SELECT to_jsonb(t) INTO c4 FROM (
    SELECT status, assigned_user_id, assigned_at, merged_into_thread_id
    FROM public.message_threads WHERE id = v_c) t;

  SELECT count(*) INTO v_msgs_a FROM public.messages WHERE thread_id = v_a;
  SELECT count(*) INTO v_msgs_b FROM public.messages WHERE thread_id = v_b;
  SELECT count(*) INTO v_msgs_c FROM public.messages WHERE thread_id = v_c;
  SELECT count(*) INTO v_active_audits FROM public.message_thread_merge_audit
   WHERE winner_thread_id = v_a AND unmerged_at IS NULL;
  SELECT count(*) INTO v_hist_after_unmerges
  FROM public.thread_assignment_history WHERE thread_id IN (v_a, v_b, v_c);

  IF v_msgs_a <> 1 OR (SELECT thread_id FROM public.messages WHERE id = v_ma) <> v_a THEN
    fails := fails || '["S4_A_MESSAGES_NOT_ONLY_ORIGINAL"]'::jsonb; END IF;
  IF v_msgs_b <> 1 OR (SELECT thread_id FROM public.messages WHERE id = v_mb) <> v_b THEN
    fails := fails || '["S4_B_NOT_RESTORED"]'::jsonb; END IF;
  IF v_msgs_c <> 1 OR (SELECT thread_id FROM public.messages WHERE id = v_mc) <> v_c THEN
    fails := fails || '["S4_C_NOT_RESTORED"]'::jsonb; END IF;
  IF v_active_audits <> 0 THEN
    fails := fails || '["S4_AUDITS_STILL_ACTIVE"]'::jsonb; END IF;
  IF (b4->>'merged_into_thread_id') IS NOT NULL OR (c4->>'merged_into_thread_id') IS NOT NULL THEN
    fails := fails || '["S4_MERGE_LINK_RESIDUAL"]'::jsonb; END IF;

  -- 7) S4 vs S0 — diff campo a campo (12 campos), sem correcao automatica
  FOREACH k IN ARRAY ARRAY['status','assigned_user_id','assigned_at','original_owner_user_id',
                           'last_message_id','last_message_at','last_message_content',
                           'last_message_direction','resolved_at','priority','category_id',
                           'needs_human_attention'] LOOP
    IF (s4->>k) IS DISTINCT FROM (s0->>k) THEN
      diff := diff || jsonb_build_object(k, jsonb_build_object('s0', s0->k, 's4', s4->k));
    END IF;
  END LOOP;

  IF diff <> '{}'::jsonb THEN
    fails := fails || '["S4_OPERATIONAL_STATE_DIVERGES_FROM_S0"]'::jsonb;
  END IF;

  rep := jsonb_build_object(
    'org', v_org, 'endpoints', jsonb_build_array(v_ep_a, v_ep_b, v_ep_c),
    'threads', jsonb_build_object('A', v_a, 'B', v_b, 'C', v_c),
    'S0_A', s0, 'S1_A', s1, 'S2_A', s2, 'S3_A', s3, 'S4_A', s4,
    'S0_B', b0, 'S4_B', b4, 'S0_C', c0, 'S4_C', c4,
    'msgs_after_S4', jsonb_build_object('A', v_msgs_a, 'B', v_msgs_b, 'C', v_msgs_c),
    'active_audits_after_S4', v_active_audits,
    'assignment_history', jsonb_build_object('after_merges', v_hist_after_merges,
                                             'after_unmerges', v_hist_after_unmerges),
    'S4_DIFF_FROM_S0', diff,
    'FAILURES', fails,
    'RESULT', CASE WHEN fails = '[]'::jsonb THEN 'PASS' ELSE 'FAIL' END
  );

  -- rollback intencional: nada sintetico persiste
  RAISE EXCEPTION 'GMUD_STAR_UNMERGE_REPORT %', rep::text;
END $$;
```

## Garantias

- Nenhum merge real, nenhum índice único, `conv_route_resolver_v2` permanece OFF.
- Nenhum UPDATE em endpoints, usuários ou threads reais; apenas INSERT sintético dentro da transação abortada.
- Zero threads/messages/auditorias sintéticas persistidas (a exceção final reverte tudo, incluindo o que as RPCs escreveram).
- Divergências de estado operacional em S4 são reportadas em `S4_DIFF_FROM_S0` e marcam `RESULT = FAIL` — sem correção automática.
