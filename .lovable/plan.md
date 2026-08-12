# Unmerge comercial — contratos finais antes da implementação (v3, nada implementado)

Escopo: `merge_sales_threads`, `unmerge_message_thread`, `message_thread_merge_audit`, `thread_assignment_history`. Atendimento intocado. Sem schema novo.

## A. Como identificar inequivocamente uma audit criada por `merge_sales_threads`

Auditoria feita: `message_thread_merge_audit` **não** tem coluna de metadata/origem, e é compartilhada por duas funções (`prosrc` confirma: `merge_message_threads` — legado — e `merge_sales_threads`). Conteúdo atual: 36 linhas, 35 ativas, 25 winners, todas de 2026-07-03, em 4 batches — inclusive 19 com `business_context = 'sales'` gravadas pelo legado. Ou seja, `business_context='sales'` **não** é marcador, e `batch_id` isolado não é auto-descritivo. Hoje existem **zero** linhas de `merge_sales_threads`.

Menor solução sem schema novo: marcar dentro do jsonb que já existe.

```sql
-- em merge_sales_threads, no INSERT da audit
loser_snapshot  = to_jsonb(v_l) || jsonb_build_object('_merge_kind','SALES_V2'),
winner_snapshot = to_jsonb(v_w) || jsonb_build_object('_merge_kind','SALES_V2')
```

Predicado canônico de SALES_V2: `winner_snapshot->>'_merge_kind' = 'SALES_V2'`.

Contrato:
- `baseline` = `winner_snapshot` da **primeira** audit SALES_V2 daquele winner (`min(executed_at)` entre as SALES_V2). Nunca baseline de merge legado.
- Replay considera **somente** audits SALES_V2 do winner (ativas ou desfeitas, conforme o passo).
- Se o winner possuir **qualquer** audit sem `_merge_kind='SALES_V2'` (ativa ou histórica), o caminho SALES_V2 é bloqueado: no merge, `RAISE EXCEPTION 'MERGE_LEGACY_AUDIT_PRESENT'`; no unmerge, `RAISE EXCEPTION 'UNMERGE_LEGACY_AUDIT_PRESENT'`. Sem heurística, sem inferência por data.
- Dry-run passa a listar esses winners como incompatíveis.

## B. Algum dos 89 winners já possui audit anterior/legada?

Consulta executada sobre os grupos comerciais duplicados (`business_context='sales'`, `merged_into_thread_id IS NULL`, agrupados por org+contato+canal, winner = mais antigo):

- 90 grupos, 90 merges candidatos;
- **winners com audit legada: 0**;
- merges cujo winner ou loser aparece como `loser_thread_id` legado: 0;
- merges cujo **loser** é winner de audit legada **ativa**: 1 — exatamente o grupo já bloqueado por `MERGE_CHAIN_NOT_ALLOWED` (o caso "Joao Teste"), o que fecha 90 candidatos = 89 executáveis + 1 bloqueado.

Conclusão: o lote de 89 é limpo em relação ao legado; a fronteira SALES_V2 é preventiva, não corretiva. As 35 audits legadas ativas continuam sob o unmerge legado, com o contrato antigo.

## C. Contrato final do guard de deriva operacional

`UNMERGE_SALES_V2` só é permitido **enquanto o estado operacional do winner continuar compatível com o estado produzido pelos merges SALES_V2 ativos**. Não é proteção contra edição humana: é proteção contra **qualquer deriva operacional posterior**, inclusive fluxo normal do produto (reabertura por nova mensagem inbound, `take_over` no inbox, resolução automática, rotinas de SLA). Qualquer uma dessas bloqueia o unmerge. Política aprovada, nenhuma heurística manual-vs-automático nesta GMUD.

Comparação (`expected` = replay incluindo a audit em desfazimento):

| campo | comparação |
|---|---|
| `status` | igualdade estrita |
| `assigned_user_id` | igualdade estrita |
| `resolved_at` | apenas `IS NULL` vs `IS NOT NULL` |
| `assigned_at` | fora do guard |

Divergência ⇒ fail closed, transação abortada, nada de unmerge parcial:

```
UNMERGE_OPERATIONAL_STATE_CONFLICT (operational drift detected; may be product-driven, not necessarily manual)
  winner=<uuid> loser=<uuid> active_merges=<n>
  current  status=<s> assignee=<u> resolved_at_null=<bool>
  expected status=<s> assignee=<u> resolved_at_null=<bool>
```

Mesmo payload em `metadata` quando houver registro de log/histórico.

## D. `thread_assignment_history` sem stamp — comportamento exato

Schema real confirmado: `id, organization_id, thread_id, action_type, from_user_id, to_user_id, performed_by_user_id, reason, metadata, created_at`. Não há coluna de thread de origem; das 7.442 linhas atuais, zero carregam origem em `metadata`. Por isso o legado depende de janela temporal — imprecisão real, mantida apenas no caminho legado.

Contrato SALES_V2:

1. `merge_sales_threads`, **antes** de mover as linhas do loser: `metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('merge_origin_thread_id', p_loser, 'merge_batch_id', p_batch)`, e guarda a contagem movida em `moved_assign_hist`.
2. `unmerge` SALES_V2 move de volta **somente** `WHERE thread_id = winner AND metadata->>'merge_origin_thread_id' = p_loser::text`.
3. Se `moved_assign_hist > 0` e a contagem de linhas stampadas encontradas for menor que `moved_assign_hist` ⇒ `RAISE EXCEPTION 'UNMERGE_ASSIGNMENT_STAMP_MISSING (expected=%, found=%)'`. **Sem fallback temporal**, em nenhuma circunstância.
4. Fallback por janela permanece exclusivamente no caminho legado (audits sem `_merge_kind`). Os dois contratos não se misturam.
5. Nada é apagado; ao final, se o replay mudou o assignee, insere linha nova (seção E).

Mesmo padrão de stamp **não** é aplicado aos outros satélites nesta GMUD (`message_response_times`, `scheduled_messages`, `tasks`, `ai_agent_logs`, `ai_interaction_logs`): permanecem com janela temporal, pois desvio ali não altera leitura de auditoria de atribuição. Limitação registrada explicitamente.

## E. Pseudocódigo final

```text
merge_sales_threads (acréscimos)
  0. se EXISTS audit do winner OU do loser sem _merge_kind='SALES_V2' -> RAISE MERGE_LEGACY_AUDIT_PRESENT
  ... lógica atual ...
  n. antes de mover assignment_history:
       UPDATE thread_assignment_history
          SET metadata = COALESCE(metadata,'{}') || {merge_origin_thread_id: loser, merge_batch_id: batch}
        WHERE thread_id = loser
     depois move thread_id -> winner (conta em moved_assign_hist)
  n+1. INSERT audit com snapshots || {_merge_kind: 'SALES_V2'}

unmerge_message_thread(p_loser)
  a := audit ativa do loser (mais recente)
  IF a.winner_snapshot->>'_merge_kind' <> 'SALES_V2' THEN  -> caminho LEGADO atual, inalterado
  -- caminho SALES_V2:
  IF EXISTS audit do winner sem _merge_kind='SALES_V2' -> RAISE UNMERGE_LEGACY_AUDIT_PRESENT

  baseline := winner_snapshot da PRIMEIRA audit SALES_V2 do winner (min executed_at)
  expected := replay(baseline, audits SALES_V2 do winner com unmerged_at IS NULL)   -- inclui 'a'
  cur      := estado atual do winner
  IF cur.status <> expected.status
     OR cur.assigned_user_id <> expected.assigned_user_id
     OR (cur.resolved_at IS NULL) <> (expected.resolved_at IS NULL)
  THEN RAISE UNMERGE_OPERATIONAL_STATE_CONFLICT (payload da seção C)

  -- devolve mensagens (merged_from_thread_id, como hoje)
  -- devolve assignment_history SOMENTE por stamp; conferir contagem vs a.moved_assign_hist
  --   mismatch -> RAISE UNMERGE_ASSIGNMENT_STAMP_MISSING
  --   limpar o stamp das linhas devolvidas
  -- devolve demais satélites por janela (como hoje)
  -- restaura o loser (status/resolved_at/merged_into_thread_id = NULL), como hoje
  UPDATE audit SET unmerged_at = now() WHERE id = a.id

  target := replay(baseline, audits SALES_V2 do winner ainda ativas)   -- exclui 'a'
  UPDATE winner SET status=target.status, assigned_user_id=target.assignee,
                    assigned_at=target.assigned_at, resolved_at=target.resolved_at, updated_at=now()
  IF target.assignee <> cur.assigned_user_id THEN
    INSERT thread_assignment_history(action_type='auto_reassign', reason='UNMERGE_SALES_V2',
      from_user_id=cur.assigned_user_id, to_user_id=target.assignee,
      metadata={batch_id, loser_thread_id, previous_assignee, recalculated_assignee, active_merges_remaining})
  -- last_message_* do winner e do loser: recalculado das mensagens reais (lógica atual)

replay(baseline, audits[])            -- função pura, usada por expected e target
  st_status   := baseline.status
  st_assignee := baseline.assigned_user_id
  st_asg_at   := baseline.assigned_at
  st_res_at   := baseline.resolved_at
  st_last_at  := COALESCE(baseline.last_message_at, baseline.created_at)
  FOR a IN audits ORDER BY a.executed_at LOOP
    ls := a.loser_snapshot
    loser_last := COALESCE(ls.last_message_at, ls.created_at)
    prev := st_assignee
    IF loser_last > st_last_at THEN st_assignee := COALESCE(ls.assigned_user_id, st_assignee)
                              ELSE st_assignee := COALESCE(st_assignee, ls.assigned_user_id) END IF
    IF st_assignee IS DISTINCT FROM prev THEN st_asg_at := a.executed_at END IF
    IF sales_thread_status_rank(ls.status) > sales_thread_status_rank(st_status) THEN st_status := ls.status END IF
    IF st_status IN ('open','in_progress','awaiting_client') THEN st_res_at := NULL END IF
    st_last_at := GREATEST(st_last_at, loser_last)      -- cumulativo
  END LOOP
```

Objetos: uma função pura auxiliar (`fn_replay_sales_merge_state(baseline jsonb, audit_ids uuid[])`, `STABLE`, sem exposição pública) + ~60 linhas nas duas funções existentes. Zero DDL de tabela.

## F. Dry-run atualizado

- 90 grupos comerciais duplicados (org+contato+canal), 90 merges candidatos.
- **89 executáveis** após a correção.
- **1 bloqueado** por `MERGE_CHAIN_NOT_ALLOWED` (loser é winner de audit legada ativa — grupo "Joao Teste"), o mesmo `BLOCKER_FOR_UNIQUE = YES` já reportado.
- **0 winners incompatíveis por audit legada** (`winners_with_legacy_audit = 0`).
- **0 candidatos** tocando `loser_thread_id` legado.
- Efeito operacional do lote (medido anteriormente): 24 merges elevam status, 7 alteram assignee — todos passam a ser reversíveis, sujeitos ao guard de deriva.
- 35 audits legadas ativas (18 sales, 17 customer_service) permanecem no contrato legado, fora do caminho SALES_V2.

Colunas que o dry-run passará a exibir: `LEGACY_AUDIT_PRESENT`, `CHAIN_BLOCKED`, `STATUS_ESCALATION`, `ASSIGNEE_CHANGE`.

## Testes (12)

1–9 conforme aprovado (unmerge parcial; unmerge total S4 == S0 nos 4 campos; ordem inversa; conflito por alteração de assignee; recência cumulativa 10:00/12:00/11:00; merge simples; idempotência; histórico preservado + nenhuma linha nativa do winner movida; isolamento do Atendimento + cadeia bloqueada).

10. **Deriva de status por fluxo normal**: após os merges, alterar `status` de A (simulando reabertura por inbound) ⇒ `unmerge(B)` levanta `UNMERGE_OPERATIONAL_STATE_CONFLICT` e nada é alterado.
11. **Audit legada**: winner com audit sem `_merge_kind='SALES_V2'` ⇒ merge e unmerge bloqueiam explicitamente (`MERGE_LEGACY_AUDIT_PRESENT` / `UNMERGE_LEGACY_AUDIT_PRESENT`); baseline nunca vem da audit legada.
12. **Stamp ausente**: SALES_V2 com `moved_assign_hist > 0` e stamp removido artificialmente ⇒ `UNMERGE_ASSIGNMENT_STAMP_MISSING`, sem fallback temporal, nada movido.

Todos em `DO` block com `RAISE EXCEPTION` final para rollback garantido e relatório JSON de divergências.

## Risco e bloqueio

Risco baixo: fail-closed em três frentes (deriva operacional, audit legada, stamp ausente); nenhuma escrita silenciosa sobre estado divergente. Custo aceito: unmerge pode ficar indisponível em threads que evoluíram após o merge — comportamento desejado nesta GMUD.

Bloqueio: os 89 merges seguem bloqueados até a correção aplicada e os 12 testes verdes. Flag `conv_route_resolver_v2` OFF, unique não criada, Fase 3 não iniciada.
