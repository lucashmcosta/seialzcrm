# Auditoria read-only — rollback operacional do unmerge (Comercial)

Escopo: apenas `public.merge_sales_threads` / `public.unmerge_message_thread` / `message_thread_merge_audit`. Atendimento não é tocado.

## 1. Corpo atual do unmerge (resumo)

`unmerge_message_thread(p_loser)`:

1. Pega a linha ativa da auditoria (`loser_thread_id = p_loser AND unmerged_at IS NULL`, mais recente).
2. Trava winner e loser em ordem determinística de UUID.
3. Devolve mensagens: `messages SET thread_id = loser, merged_from_thread_id = NULL WHERE merged_from_thread_id = loser`.
4. Devolve satélites (`thread_assignment_history`, `message_response_times`, `scheduled_messages`, `tasks`, `ai_agent_logs`, `ai_interaction_logs`) por janela de tempo `created_at BETWEEN loser_snapshot.created_at AND audit.executed_at`.
5. Restaura o **loser**: `status = loser_prev_status`, `merged_into_thread_id = NULL`, `resolved_at = loser_snapshot.resolved_at`.
6. Recalcula `last_message_*` do loser e do winner (com limpeza quando não sobra mensagem real).
7. Marca `unmerged_at = now()`.

Nada além de `last_message_*` é escrito no **winner**.

## 2. Por que status / assignee / assigned_at / resolved_at ficam errados

`merge_sales_threads` altera o winner em três pontos:

- `assigned_user_id = v_final_assignee` (recência da última mensagem decide winner vs loser);
- `assigned_at = now()` quando o assignee muda;
- `status = max(rank(status_winner), rank(status_loser))` e `resolved_at = NULL` quando o status resultante é `open|in_progress|awaiting_client`.

O unmerge não desfaz nenhum desses quatro campos. Logo o winner permanece com o estado herdado do último merge aplicado — exatamente a falha do teste sintético (A ficou `open`/u3 em vez de `resolved`/u1). O dado para reverter já existe: `winner_snapshot` guarda `to_jsonb(winner)` **antes** daquele merge.

## 3. Estratégia mínima recomendada — (A) recálculo, não (B) restauração

(B) está incorreta mesmo no caso total: `winner_snapshot` do último merge não é o estado pré-merges quando os unmerges ocorrem fora de ordem (ex.: unmerge(C) depois unmerge(B) restauraria um snapshot que já contém efeitos de B). E não cobre unmerge parcial.

(A) é correta e cabe nos snapshots atuais, sem novo schema:

```text
baseline := winner_snapshot da linha MAIS ANTIGA de audit para aquele winner
            (min(executed_at), incluindo linhas já desfeitas)
losers    := linhas de audit do winner com unmerged_at IS NULL, após marcar a atual
             como desfeita, ordenadas por executed_at
estado    := baseline
para cada L em losers:  estado := aplicar_regra_merge(estado, L.loser_snapshot)
UPDATE winner SET status/assigned_user_id/assigned_at/resolved_at := estado
```

`aplicar_regra_merge` é literalmente a regra já usada no merge (rank de status; assignee por recência de `last_message_at`; `resolved_at` anulado em status abertos), aplicada sobre snapshots — determinística e idempotente. Sem event sourcing, sem árvore, sem tabela nova.

Consequências: `losers` vazio ⇒ winner volta a `baseline` (requisito 1). `losers = {C}` ⇒ winner = baseline⊕C, coerente com A+C (requisito 2).

## 4. Campos cobertos

Restaurados/recalculados: `status`, `assigned_user_id`, `assigned_at`, `resolved_at`.

`assigned_at`: usa o `assigned_at` do baseline quando o assignee final igualar o do baseline; `now()` quando mudar.

Fora do escopo, confirmado por leitura do corpo do merge — nenhum é escrito por `merge_sales_threads`, portanto não deve ser restaurado (restaurar seria regressão de edições legítimas do usuário):

- `priority` — não
- `category_id` — não
- `needs_human_attention` — não
- `original_owner_user_id` — não
- `last_message_*` — não entra no replay; já é recalculado por mensagens reais no unmerge atual (comportamento correto e validado no teste).

## 5. thread_assignment_history

Não apagar histórico. Quando o replay mudar `assigned_user_id`, inserir uma entrada nova, espelhando o padrão do merge:

`action_type='auto_reassign'`, `from_user_id`=assignee atual, `to_user_id`=assignee recalculado, `reason='UNMERGE_SALES_V2'`, `metadata = {batch_id, loser_thread_id, active_remaining}`.

Ponto de atenção existente (não regressão desta correção, mas deve ser verificado): o passo 4 move linhas de `thread_assignment_history` do winner para o loser por **janela de tempo**, podendo levar linhas que sempre foram do winner. A entrada `MERGE_SALES_V2` gravada pelo próprio merge cai nessa janela. Recomendo restringir esse move por `metadata->>'loser_thread_id'`/origem quando disponível — item pequeno, mesma correção.

## 6. SQL / pseudocódigo proposto (não aplicado)

Bloco a acrescentar ao final de `unmerge_message_thread`, depois de `unmerged_at = now()`:

```sql
-- baseline: estado do winner antes de QUALQUER merge
SELECT winner_snapshot INTO v_base
  FROM message_thread_merge_audit
 WHERE winner_thread_id = v_winner
 ORDER BY executed_at ASC LIMIT 1;

v_status   := v_base->>'status';
v_assignee := NULLIF(v_base->>'assigned_user_id','')::uuid;
v_asg_at   := NULLIF(v_base->>'assigned_at','')::timestamptz;
v_res_at    := NULLIF(v_base->>'resolved_at','')::timestamptz;
v_last_at   := NULLIF(v_base->>'last_message_at','')::timestamptz;

FOR r IN SELECT loser_snapshot ls FROM message_thread_merge_audit
          WHERE winner_thread_id = v_winner AND unmerged_at IS NULL
          ORDER BY executed_at
LOOP
  -- assignee por recencia (mesma regra do merge)
  IF COALESCE((r.ls->>'last_message_at')::timestamptz,(r.ls->>'created_at')::timestamptz)
     > COALESCE(v_last_at, v_base_created) THEN
    v_assignee := COALESCE(NULLIF(r.ls->>'assigned_user_id','')::uuid, v_assignee);
  ELSE
    v_assignee := COALESCE(v_assignee, NULLIF(r.ls->>'assigned_user_id','')::uuid);
  END IF;
  -- status por rank
  IF sales_thread_status_rank(r.ls->>'status') > sales_thread_status_rank(v_status) THEN
    v_status := r.ls->>'status';
  END IF;
  IF v_status IN ('open','in_progress','awaiting_client') THEN v_res_at := NULL; END IF;
END LOOP;

SELECT assigned_user_id INTO v_cur FROM message_threads WHERE id = v_winner;

UPDATE message_threads
   SET status = v_status,
       assigned_user_id = v_assignee,
       assigned_at = CASE WHEN v_assignee IS DISTINCT FROM v_cur THEN now() ELSE v_asg_at END,
       resolved_at = v_res_at,
       updated_at = now()
 WHERE id = v_winner;

IF v_assignee IS DISTINCT FROM v_cur THEN
  INSERT INTO thread_assignment_history (organization_id, thread_id, action_type,
    from_user_id, to_user_id, reason, metadata)
  VALUES (a.organization_id, v_winner, 'auto_reassign', v_cur, v_assignee,
          'UNMERGE_SALES_V2',
          jsonb_build_object('loser_thread_id', p_loser, 'batch_id', a.batch_id));
END IF;
```

Diff total: ~40 linhas em uma função, zero mudança de schema, zero tabela nova.

## 7. Testes necessários (antes de dado real)

1. Repetir o cenário sintético em transação com rollback: `B→A`, `C→A`, `unmerge(B)` ⇒ validar A coerente com A+C (status/assignee/assigned_at/resolved_at + mensagens/provenance); `unmerge(C)` ⇒ validar A == S0 nos 4 campos e diff S4 vs S0 vazio.
2. Ordem inversa: `unmerge(C)` antes de `unmerge(B)` — mesmo resultado final.
3. Merge simples (1 loser): unmerge ⇒ winner == S0.
4. Idempotência: rodar o replay duas vezes não muda o resultado.
5. Cadeia continua bloqueada (`MERGE_CHAIN_NOT_ALLOWED`).
6. Regressão Atendimento: nenhuma thread com `business_context <> 'sales'` afetada.

## 8. Risco

- Médio-baixo e contido ao unmerge comercial. O replay **sobrescreve** mudanças manuais feitas no winner após o merge (se um humano reatribuiu/fechou a thread depois, o unmerge volta ao recálculo). Mitigação possível: gravar em `metadata` o valor sobrescrito, ou só recalcular quando o valor atual for igual ao resultado do merge. Decisão sua.
- `assigned_at` é aproximação (o merge original também usa `now()`); diff exato de timestamp não é reversível ao microssegundo.
- Move por janela de tempo em `thread_assignment_history` permanece impreciso até o ajuste do item 5.

## 9. Bloqueia os 89 merges?

Sim — enquanto o rollback não for completo, o lote não deve rodar. Depois desta correção (~40 linhas) e dos testes 1–6 verdes, os 89 merges deixam de ter bloqueador de reversibilidade; os 24 que elevam status e os 7 que trocam assignee passam a ser reversíveis.
