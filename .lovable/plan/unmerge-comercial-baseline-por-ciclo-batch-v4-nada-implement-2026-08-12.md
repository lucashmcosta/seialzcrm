# Unmerge comercial — baseline por ciclo/batch (v4, nada implementado)

Escopo: `merge_sales_threads`, `unmerge_message_thread`, `message_thread_merge_audit`, `thread_assignment_history`. Atendimento intocado. Sem schema novo.

## 1. Contrato final de batch/ciclo

`batch_id` passa a ser a **fronteira do ciclo de consolidação**. Baseline nunca é histórico global do winner.

```text
audit_current := audit ativa de p_loser (mais recente)
batch         := audit_current.batch_id
scope         := audits WHERE winner_thread_id = winner
                        AND batch_id = batch
                        AND winner_snapshot->>'_merge_kind' = 'SALES_V2'
baseline      := winner_snapshot da PRIMEIRA audit de scope (min executed_at)
expected      := replay(baseline, scope WHERE unmerged_at IS NULL)      -- inclui audit_current
target        := replay(baseline, scope WHERE unmerged_at IS NULL)      -- após marcar audit_current desfeita
```

Nenhuma audit de batch anterior entra em baseline, expected ou target.

**Invariante de batch ativo** (garante que o baseline de um ciclo nunca se mistura com outro): em `merge_sales_threads`, se existir audit SALES_V2 **ativa** para o winner com `batch_id <> p_batch` ⇒ `RAISE EXCEPTION 'MERGE_ACTIVE_BATCH_CONFLICT (winner=%, active_batch=%, requested_batch=%)'`, rollback integral. Logo todo star-merge `A<-B`, `A<-C`, `A<-D` de uma consolidação vive no mesmo batch; um novo batch só pode começar depois que todas as audits do batch anterior estiverem desfeitas — e então captura um baseline novo.

Ciclos, conforme exigido:

```text
Ciclo 1 (batch X): A = T0
  B -> A ; C -> A       baseline X = snapshot de A antes de B (T0)
  unmerge(B) ; unmerge(C)  -> A == T0
A evolui para T1 (mensagens, status, assignee)
Ciclo 2 (batch Y): D -> A
  baseline Y = snapshot de A em T1   (nunca T0)
  unmerge(D)               -> A == T1
```

O bloqueio de audit legada continua valendo e é avaliado **fora** do escopo de batch: qualquer audit do winner (qualquer batch) sem `_merge_kind='SALES_V2'` ⇒ `MERGE_LEGACY_AUDIT_PRESENT` / `UNMERGE_LEGACY_AUDIT_PRESENT`.

## 2. Alteração do pseudocódigo

```text
merge_sales_threads (acréscimos, na ordem)
  0a. se EXISTS audit (winner OU loser) sem _merge_kind='SALES_V2' -> RAISE MERGE_LEGACY_AUDIT_PRESENT
  0b. se EXISTS audit SALES_V2 ativa do winner com batch_id <> p_batch
        -> RAISE MERGE_ACTIVE_BATCH_CONFLICT
  0c. MERGE_CHAIN_NOT_ALLOWED (mantido, inalterado)
  ... lógica atual ...
  n.  stamp em thread_assignment_history antes de mover (merge_origin_thread_id, merge_batch_id)
  n+1. INSERT audit com snapshots || {_merge_kind:'SALES_V2'}

unmerge_message_thread(p_loser)
  a := audit ativa de p_loser (mais recente)
  IF a.winner_snapshot->>'_merge_kind' <> 'SALES_V2' -> caminho LEGADO atual, inalterado
  -- caminho SALES_V2:
  IF EXISTS audit do winner sem _merge_kind='SALES_V2' -> RAISE UNMERGE_LEGACY_AUDIT_PRESENT

  v_batch := a.batch_id
  baseline := winner_snapshot da primeira audit SALES_V2 de (winner, v_batch)   -- min executed_at
  expected := replay(baseline, audits SALES_V2 de (winner, v_batch) com unmerged_at IS NULL)
  cur := estado atual do winner
  guard: status estrito, assigned_user_id estrito, resolved_at só NULL vs NOT NULL
         divergência -> RAISE UNMERGE_OPERATIONAL_STATE_CONFLICT (payload com winner, loser,
         batch, active_merges, current/expected)

  -- devolve mensagens por merged_from_thread_id
  -- devolve assignment_history SOMENTE por stamp; contagem < moved_assign_hist
  --   -> RAISE UNMERGE_ASSIGNMENT_STAMP_MISSING (sem fallback temporal)
  -- demais satélites por janela (como hoje)
  -- restaura o loser
  UPDATE audit SET unmerged_at = now() WHERE id = a.id

  target := replay(baseline, audits SALES_V2 de (winner, v_batch) com unmerged_at IS NULL)
  UPDATE winner SET status, assigned_user_id, assigned_at, resolved_at := target
  IF target.assignee <> cur.assigned_user_id
     -> INSERT thread_assignment_history ('auto_reassign','UNMERGE_SALES_V2',
        metadata {batch_id, loser_thread_id, previous_assignee, recalculated_assignee,
                  active_merges_remaining})
  -- last_message_* do winner e do loser recalculados pelas mensagens reais
```

`replay(baseline, audits[])` inalterado em relação à v3 (recência cumulativa via `st_last_at := GREATEST(...)`, status por rank, `assigned_at := a.executed_at` só quando o assignee muda de fato, `resolved_at := NULL` em status abertos). Única mudança: o conjunto `audits[]` agora é filtrado por `batch_id`. A assinatura auxiliar passa a `fn_replay_sales_merge_state(baseline jsonb, audit_ids uuid[])` recebendo já a lista escopada por winner+batch.

## 3. Como os 89 serão batchados

- **Um único `batch_id` comum** para a execução do lote (um `gen_random_uuid()` por run), como já ocorre no dry-run atual. Isso é seguro porque todo escopo do replay é `(winner_thread_id, batch_id)`: winners diferentes compartilhando o mesmo batch não se enxergam.
- Cada um dos 89 grupos é um star-merge de **um único loser** sobre seu winner (90 grupos, 90 pares, 1 par por grupo) — portanto, dentro do batch, cada winner tem exatamente uma audit. Grupos com 2+ losers, se surgirem, ficam no mesmo batch e o replay os ordena por `executed_at`.
- Verificado agora: **zero** audits com `_merge_kind='SALES_V2'` no banco (as 36 existentes, todas de 2026-07-03, são do legado `merge_message_threads` — 35 ativas, 25 winners, batches `74ea34ce…`, `e004b5b6…`, `04a95d88…`, `e24e268f…`). Logo **nenhum** dos 89 pode disparar `MERGE_ACTIVE_BATCH_CONFLICT`.
- Também confirmado: **0** dos 89 winners possui audit legada (`winners_with_legacy_audit = 0`), então nenhum cai em `MERGE_LEGACY_AUDIT_PRESENT`.

## 4. Testes 13 e 14

**13 — Baseline por ciclo (anti-regressão do bug)**
1. A em T0 (status/assignee/assigned_at/resolved_at capturados).
2. `B -> A` no batch X; `unmerge(B)` ⇒ A == T0 (diff campo a campo).
3. Mutar A para T1: nova mensagem inbound, `status` diferente, assignee diferente, `assigned_at` novo; capturar T1 explicitamente pós-triggers.
4. `D -> A` no batch Y (permitido: batch X sem audit ativa).
5. Assert: `baseline Y` = snapshot de A em T1 (ler `winner_snapshot` da audit Y).
6. `unmerge(D)` ⇒ A == **T1** exatamente nos 4 campos; assert explícito `A <> T0` para status ou assignee.

**14 — Invariante de batch ativo**
1. A em T0; `B -> A` no batch X (audit X ativa).
2. Tentar `C -> A` no batch Y ⇒ espera `MERGE_ACTIVE_BATCH_CONFLICT`.
3. Assert rollback integral: nenhuma mensagem de C movida, C sem `merged_into_thread_id`, nenhuma audit Y criada, A idêntica ao estado pós-merge de B, nenhum stamp novo em `thread_assignment_history`.
4. Controle positivo: `C -> A` no batch **X** é aceito (star-merge do mesmo ciclo).

Ambos dentro do `DO` block único, dados sintéticos, `RAISE EXCEPTION` final para rollback garantido e relatório JSON de divergências. Total: **14 testes** (1–12 da v3 mantidos).

## 5. Novos bloqueadores no dry-run

Nenhum novo. Situação consolidada:

- 90 grupos / 90 candidatos; **89 executáveis**, **1 bloqueado** por `MERGE_CHAIN_NOT_ALLOWED` (loser é winner de audit legada ativa — grupo "Joao Teste"), o mesmo `BLOCKER_FOR_UNIQUE = YES` já reportado;
- `MERGE_ACTIVE_BATCH_CONFLICT`: 0 casos;
- `MERGE_LEGACY_AUDIT_PRESENT`: 0 winners;
- efeito operacional do lote: 24 merges elevam status, 7 alteram assignee — todos reversíveis após a correção, sujeitos ao guard de deriva;
- 35 audits legadas ativas (18 sales, 17 customer_service) permanecem no contrato legado, fora do caminho SALES_V2.

Colunas do dry-run: `LEGACY_AUDIT_PRESENT`, `ACTIVE_BATCH_CONFLICT`, `CHAIN_BLOCKED`, `STATUS_ESCALATION`, `ASSIGNEE_CHANGE`.

## Bloqueio

Os 89 merges seguem bloqueados até a correção aplicada e os 14 testes verdes. Flag `conv_route_resolver_v2` OFF, unique não criada, Fase 3 não iniciada.
