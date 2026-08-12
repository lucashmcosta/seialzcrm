# Unmerge comercial — replay determinístico do estado operacional (v2, não implementado)

Escopo: `public.merge_sales_threads`, `public.unmerge_message_thread`, `message_thread_merge_audit`, `thread_assignment_history`. Atendimento intocado. Nenhum schema novo.

## 1. Algoritmo final de replay

Executado no fim do `unmerge_message_thread(p_loser)`, depois de marcar `unmerged_at = now()` na audit desfeita.

```text
1. baseline := winner_snapshot da audit MAIS ANTIGA do winner (min executed_at, incluindo já desfeitas)
2. expected := replay(baseline, merges ativos ANTES deste unmerge)   -- inclui a audit atual
3. GUARD: se estado atual do winner <> expected  -> RAISE UNMERGE_OPERATIONAL_STATE_CONFLICT
4. target := replay(baseline, merges ativos DEPOIS deste unmerge)    -- exclui a audit atual
5. UPDATE winner SET status, assigned_user_id, assigned_at, resolved_at := target
6. se assignee mudou -> INSERT thread_assignment_history (UNMERGE_SALES_V2)
7. last_message_* do winner e do loser: recalculados das mensagens reais (lógica atual, inalterada)
```

`replay(baseline, L[])` é uma função interna determinística que reproduz literalmente `merge_sales_threads`, iterando `L` por `executed_at` crescente. Chamada duas vezes (expected e target) com o mesmo baseline — o guard e o resultado saem do mesmo motor, sem duplicar regra.

```text
replay(baseline, L[]):
  st_status   := baseline.status
  st_assignee := baseline.assigned_user_id
  st_asg_at   := baseline.assigned_at
  st_res_at    := baseline.resolved_at
  st_last_at   := COALESCE(baseline.last_message_at, baseline.created_at)

  FOR a IN L ORDER BY a.executed_at LOOP
    ls          := a.loser_snapshot
    loser_last  := COALESCE(ls.last_message_at, ls.created_at)
    prev        := st_assignee

    IF loser_last > st_last_at THEN
      st_assignee := COALESCE(ls.assigned_user_id, st_assignee)
    ELSE
      st_assignee := COALESCE(st_assignee, ls.assigned_user_id)
    END IF

    IF st_assignee IS DISTINCT FROM prev THEN
      st_asg_at := a.executed_at            -- transição determinística
    END IF

    IF rank(ls.status) > rank(st_status) THEN st_status := ls.status END IF
    IF st_status IN ('open','in_progress','awaiting_client') THEN st_res_at := NULL END IF

    st_last_at := GREATEST(st_last_at, loser_last)   -- recência CUMULATIVA
  END LOOP
  RETURN (st_status, st_assignee, st_asg_at, st_res_at)
```

`rank` = `public.sales_thread_status_rank`, a mesma do merge.

## 2. state_last_at

Inicia em `COALESCE(baseline.last_message_at, baseline.created_at)` e, ao fim de cada iteração, recebe `GREATEST(state_last_at, loser_last_at)`. Assim o cenário A=10:00, B=12:00, C=11:00 avalia C contra 12:00 (não contra 10:00) e o replay reproduz exatamente o que teria acontecido se só os merges considerados tivessem ocorrido. A ordenação por `executed_at` garante idempotência e independência da ordem dos unmerges.

## 3. Regra exata de `assigned_at`

- Nenhum merge ativo restante: `assigned_at = baseline.assigned_at` (nunca `now()`), portanto unmerge total devolve `T0`.
- Com merges ativos: `assigned_at` = `executed_at` da última audit ativa que efetivamente mudou o assignee no replay; se nenhuma mudou, permanece `baseline.assigned_at`.
- `now()` não aparece em nenhum ponto do estado operacional reconstruído (apenas em `updated_at` e no `created_at` do registro de histórico).

Nota de precisão: `merge_sales_threads` gravou `now()` na execução real, que é ligeiramente posterior ao `executed_at` da mesma transação. A reconstrução usa `executed_at` por ser determinístico; para o guard, a comparação de `assigned_at` é feita com tolerância (ver 4).

## 4. Guard contra alteração manual posterior

Antes de escrever qualquer coisa, compara o estado atual do winner com `expected` (replay incluindo a audit em desfazimento). Divergência ⇒ `RAISE EXCEPTION 'UNMERGE_OPERATIONAL_STATE_CONFLICT (winner=%, field=%, current=%, expected=%)'`, transação abortada, nada de unmerge parcial nem sobrescrita.

Campos do guard:

- `assigned_user_id` — protegido (igualdade estrita).
- `status` — protegido (igualdade estrita).
- `resolved_at` — protegido, mas de forma derivada: só compara `IS NULL` vs `IS NOT NULL`. O valor absoluto de `resolved_at` é preservado pelo merge (`COALESCE`) e pode ter sido regravado por triggers de reabertura; comparar timestamp exato geraria falso conflito.
- `assigned_at` — **não** entra no guard. É consequência do assignee, e a diferença `now()` vs `executed_at` da execução original produziria falso positivo em praticamente todo merge do lote. Se `assigned_user_id` e `status` conferem, considera-se que não houve intervenção humana.

Sinal auxiliar disponível e recomendado no texto da exceção (diagnóstico, não decisão): existência de linha em `thread_assignment_history` do winner com `created_at > audit.executed_at` e `reason <> 'MERGE_SALES_V2'` — indica reatribuição manual (`inbox_manual_reassign`, `inbox_reassign_to_self`). Não há sinal equivalente para mudança manual de `status` (não existe tabela de histórico de status), por isso a comparação direta de `status` é essencial.

## 5. thread_assignment_history — problema da janela temporal

Confrontado com o schema real: `thread_assignment_history` tem apenas `id, organization_id, thread_id, action_type, from_user_id, to_user_id, performed_by_user_id, reason, metadata, created_at`. **Não existe** coluna de thread de origem, e o conteúdo atual não carrega isso em `metadata` (7.442 linhas: `inbox_reassign_to_self`, `inbox_manual_reassign`, smokes; zero com `loser_thread_id`).

Consequência: para os merges **já executados**, não é possível determinar com segurança quais linhas pertenciam originalmente ao loser. O critério atual (`created_at BETWEEN loser_snapshot.created_at AND executed_at`) captura por igual linhas nativas do winner naquele intervalo — inclusive a própria entrada `MERGE_SALES_V2` gravada pelo merge. Não vou inventar regra: **limitação reportada**.

Menor forma determinística, aplicável apenas daqui para frente (sem schema novo, só `jsonb`):

- no `merge_sales_threads`, ao mover as linhas do loser, gravar `metadata = metadata || jsonb_build_object('merge_origin_thread_id', p_loser, 'merge_batch_id', p_batch)`;
- no `unmerge_message_thread`, mover de volta **somente** `WHERE thread_id = winner AND metadata->>'merge_origin_thread_id' = p_loser::text`, com fallback à janela temporal apenas quando não existir nenhuma linha marcada (compatibilidade com merges antigos), excluindo explicitamente linhas com `reason IN ('MERGE_SALES_V2','UNMERGE_SALES_V2')`.

Como o lote de 89 ainda não rodou, o stamp cobre 100% dos merges desta GMUD. O mesmo padrão vale para `message_response_times`, `scheduled_messages`, `tasks`, `ai_agent_logs`, `ai_interaction_logs` — mas para estes o custo/benefício é menor e a decisão fica sua; a proposta mínima é aplicar somente em `thread_assignment_history` (o único cujo desvio muda leitura de auditoria).

## 6. Registro no histórico

Quando o replay mudar de fato o assignee:

```sql
INSERT INTO thread_assignment_history (organization_id, thread_id, action_type,
  from_user_id, to_user_id, reason, metadata)
VALUES (a.organization_id, v_winner, 'auto_reassign', v_current_assignee, v_target_assignee,
  'UNMERGE_SALES_V2',
  jsonb_build_object(
    'batch_id', a.batch_id,
    'loser_thread_id', p_loser,
    'previous_assignee', v_current_assignee,
    'recalculated_assignee', v_target_assignee,
    'active_merges_remaining', v_active_remaining
  ));
```

Nada é apagado.

## 7. Campos do replay

Restaurados/recalculados: `status`, `assigned_user_id`, `assigned_at`, `resolved_at`.
Nunca tocados (o merge não os escreve): `priority`, `category_id`, `needs_human_attention`, `original_owner_user_id`.
`last_message_*`: sempre recalculado das mensagens reais, jamais de snapshot.

## 8. SQL proposto (bloco final, não aplicado)

```sql
-- ... corpo atual de unmerge_message_thread ...
UPDATE message_thread_merge_audit SET unmerged_at = now() WHERE id = a.id;

-- baseline pre-merges
SELECT winner_snapshot INTO v_base
  FROM message_thread_merge_audit
 WHERE winner_thread_id = a.winner_thread_id
 ORDER BY executed_at ASC LIMIT 1;

-- expected = baseline + (ativos + esta audit) ; target = baseline + ativos
SELECT * INTO v_exp FROM public.fn_replay_sales_merge_state(v_base,
         ARRAY(SELECT id FROM message_thread_merge_audit
                WHERE winner_thread_id = a.winner_thread_id
                  AND (unmerged_at IS NULL OR id = a.id)
                ORDER BY executed_at));
SELECT * INTO v_tgt FROM public.fn_replay_sales_merge_state(v_base,
         ARRAY(SELECT id FROM message_thread_merge_audit
                WHERE winner_thread_id = a.winner_thread_id AND unmerged_at IS NULL
                ORDER BY executed_at));

SELECT status, assigned_user_id, assigned_at, resolved_at
  INTO v_cur FROM message_threads WHERE id = a.winner_thread_id;

IF v_cur.status IS DISTINCT FROM v_exp.status
   OR v_cur.assigned_user_id IS DISTINCT FROM v_exp.assigned_user_id
   OR (v_cur.resolved_at IS NULL) IS DISTINCT FROM (v_exp.resolved_at IS NULL) THEN
  RAISE EXCEPTION 'UNMERGE_OPERATIONAL_STATE_CONFLICT (winner=%, loser=%, cur=%/%/%, exp=%/%/%)',
    a.winner_thread_id, p_loser, v_cur.status, v_cur.assigned_user_id, v_cur.resolved_at,
    v_exp.status, v_exp.assigned_user_id, v_exp.resolved_at;
END IF;

UPDATE message_threads
   SET status = v_tgt.status,
       assigned_user_id = v_tgt.assigned_user_id,
       assigned_at = v_tgt.assigned_at,
       resolved_at = v_tgt.resolved_at,
       updated_at = now()
 WHERE id = a.winner_thread_id;

IF v_tgt.assigned_user_id IS DISTINCT FROM v_cur.assigned_user_id THEN
  -- INSERT thread_assignment_history conforme secao 6
END IF;
```

`fn_replay_sales_merge_state(baseline jsonb, audit_ids uuid[])` é uma função interna auxiliar (`STABLE`, `SECURITY DEFINER`, sem RLS pública) que implementa o pseudocódigo da seção 1. É o único objeto novo — uma função pura, sem tabela, sem trigger. Se preferir zero objetos novos, o mesmo laço pode ser inlined duas vezes dentro do unmerge; recomendo a função para garantir que expected e target usem código idêntico.

## 9. Testes sintéticos revisados (transação única com rollback)

Setup: 3 endpoints WhatsApp reais da mesma org, 3 usuários distintos, threads A/B/C sintéticas com `last_message_at` A=10:00, B=12:00, C=11:00 e baseline explícita pós-triggers (S0 = `resolved`/u1/`resolved_at` preenchido).

1. **Caso 1 — unmerge parcial**: `B→A`, `C→A`, `unmerge(B)` ⇒ A igual ao estado que teria com apenas `C→A` (calculado independentemente, hardcoded no teste, não pelo replay); mensagens/provenance de B devolvidas; C ainda ativo.
2. **Caso 2 — unmerge total**: em seguida `unmerge(C)` ⇒ `status`, `assigned_user_id`, `assigned_at`, `resolved_at` idênticos a S0 (diff campo a campo, sem tolerância em assignee/status, igualdade exata em `assigned_at` = T0); `last_message_*` coerente com as mensagens de A.
3. **Caso 3 — ordem inversa**: `unmerge(C)` depois `unmerge(B)` ⇒ resultado final idêntico a S0.
4. **Caso 4 — conflito**: após os merges, `UPDATE` manual do assignee de A ⇒ `unmerge(B)` deve levantar `UNMERGE_OPERATIONAL_STATE_CONFLICT` e não alterar nada (verificar estado inalterado após capturar a exceção).
5. **Caso 5 — recência cumulativa**: cenário 10:00/12:00/11:00 prova que C é comparado com 12:00 (assignee final não vem de C).
6. **Caso 6 — merge simples**: 1 loser, unmerge ⇒ winner == S0.
7. **Caso 7 — idempotência**: rodar o replay duas vezes com os mesmos ativos ⇒ mesmo resultado.
8. **Caso 8 — histórico**: linha `UNMERGE_SALES_V2` criada no total, nenhuma linha antiga apagada, e (com o stamp) nenhuma linha nativa do winner movida para o loser.
9. **Caso 9 — isolamento**: nenhuma thread com `business_context <> 'sales'` afetada; cadeia continua bloqueada por `MERGE_CHAIN_NOT_ALLOWED`.

Todos em `DO` block com `RAISE EXCEPTION` final para rollback garantido e relatório JSON de divergências.

## 10. Risco e bloqueio

Risco baixo: uma função pura nova, ~50 linhas acrescentadas ao unmerge, um stamp em `metadata` no merge. Fail-closed elimina o risco de sobrescrever decisão humana. Limitação conhecida e reportada: merges antigos (pré-stamp) continuam dependendo da janela temporal para satélites — não afeta o lote de 89, que será stampado.

Bloqueio: os 89 merges permanecem bloqueados até esta correção estar aplicada e os casos 1–9 verdes. Flag `conv_route_resolver_v2` continua OFF; unique não criada; Fase 3 não iniciada.
