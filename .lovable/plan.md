# FASE 2 — Migração Comercial (execução aprovada, pendente de build mode)

Ainda estou em modo de planejamento, então **nada foi escrito no banco**. Abaixo: o dry-run detalhado que você pediu, dois achados novos que mudam a execução, e o roteiro exato pronto para rodar.

---

## 1. Decisões já incorporadas

- **Meta 2890 (Viagi)** — opção 1‑A: vínculo apenas como endpoint **inbound** da Route Comercial (`95beef60…`). `active_endpoint_id` permanece Evolution 8439. Nenhuma thread ou mensagem histórica é alterada pelo vínculo.
- **Twilio 5098 (Viagi)** e **Meta 7020 (Central)** — opção 2‑B: **não** vinculados, não reativados. Histórico preservado; threads entram no backfill/merge.
- **Backfill** — somente as 142 threads determinísticas do 5098. Ambíguas intactas. `lifecycle_stage` não é usado.
- **Unique** — só depois de duplicidades `sales` = 0, com validação bloqueante imediatamente antes.
- **Flag** — `conv_route_resolver_v2` ligada apenas para a Viagi, e só ao fim de todos os gates. Nunca global.
- **Atendimento** — intocado.

---

## 2. DRY-RUN — grupos com assignee divergente (o número real é 7, não 10)

Os 10 grupos do preview anterior incluíam threads já mergeadas em rodadas antigas (`merged_into_thread_id` preenchido). Filtrando apenas threads vivas, restam **7 grupos / 14 threads** — nenhum com oportunidade vinculada, nenhum com duas oportunidades abertas.

| contato | thread | criada | última msg | status | assignee | owner original | endpoint | msgs | winner (antiguidade) | fonte do assignee (atividade recente) |
|---|---|---|---|---|---|---|---|---|---|---|
| 25d23519 | d2a3aaa4 | 01/06 | 02/06 19:01 | open | Ketlyn Vieira | – | 5098 | 6 | **SIM** | |
| 25d23519 | e196f6ed | 09/07 | 13/07 18:23 | awaiting_client | Marlisa Fernandes | Marlisa Fernandes | 2890 | 26 | | **Marlisa** |
| 4fc63900 | 795a02a9 | 11/07 | 07/08 14:37 | open | Tamires Sousa | Tamires Sousa | 7020 | 11 | **SIM** | |
| 4fc63900 | 24b506a4 | 07/08 | 07/08 14:38 | open | Eduarda Ubeid | Eduarda Ubeid | 7067 | 1 | | **Eduarda** |
| 534f0152 | 2a821bc4 | 12/05 | 12/05 15:34 | open | Ketlyn Vieira | – | 5098 | 1 | **SIM** | |
| 534f0152 | 7cd9d957 | 10/07 | 10/07 22:47 | resolved | Marlisa Fernandes | Marlisa Fernandes | 2890 | 5 | | **Marlisa** |
| 6ddebdab | f3d710de | 26/06 | 26/06 18:23 | resolved | Luyza Calegari | Victoria Amorim | (none) | 2 | **SIM** | |
| 6ddebdab | 04c5dada | 29/06 | 01/07 14:26 | open | Victoria Amorim | Victoria Amorim | 7020 | 101 | | **Victoria** |
| 8424fc8e | 1d09c288 | 06/07 | 07/08 16:26 | awaiting_client | Tamires Sousa | Tamires Sousa | 7020 | 22 | **SIM** | |
| 8424fc8e | 2d0acad4 | 07/08 | 07/08 18:24 | open | Eduarda Ubeid | Eduarda Ubeid | 7067 | 1 | | **Eduarda** |
| ceec2ee3 | 84e5f30c | 21/06 | 24/06 18:28 | resolved | Mariane Carvalho | Luana Cardoso | (none) | 81 | **SIM** | |
| ceec2ee3 | 6202885a | 14/07 | 14/07 20:47 | awaiting_client | Luana Cardoso | Luana Cardoso | 7067 | 17 | | **Luana** |
| d64e3b40 | c4abd068 | 22/06 | 22/06 18:41 | open | Luana Cardoso | Luana Cardoso | (none) | 4 | **SIM** | |
| d64e3b40 | de049d3b | 07/07 | 07/07 03:24 | open | Victoria Amorim | Luana Cardoso | 7020 | 1 | | **Victoria** |

Observação relevante para a política: em **6 dos 7 grupos** o assignee da thread mais recente coincide com o `original_owner_user_id` dessa thread; o único caso "estranho" é `6ddebdab`, onde a thread antiga tem assignee (Luyza) diferente do owner original (Victoria), e a thread recente concentra 101 mensagens com Victoria.

**Política de assignee que preciso que você escolha (nada será executado antes):**

- **(A) Recomendada** — assignee = da thread com atividade mais recente (`last_message_at DESC`). Resultado: Marlisa, Eduarda, Marlisa, Victoria, Eduarda, Luana, Victoria.
- **(B)** assignee = da thread winner (mais antiga), preservando o dono histórico.
- **(C)** deixar os 7 grupos sem merge e sem unique nesse recorte — inviabiliza a unique global.

## 3. ACHADO NOVO — a RPC de merge atual recusa merge cross-endpoint

A função existente `public.merge_message_threads(winner, loser, batch)` valida `primary_endpoint_id` **igual** entre winner e loser e aborta com `grouping key mismatch` quando diferem. Como a GMUD unifica justamente threads de números diferentes (69 dos grupos), ela não serve para a Fase 2. Ela também move `message_thread_reads` com `UPDATE` direto, o que colide com a chave (`thread_id`,`user_id`) quando os dois lados têm leitura do mesmo usuário.

Correção proposta (migration, sem alterar a função atual usada pelo Atendimento): nova RPC `merge_sales_threads(p_winner, p_loser, p_batch)`, `SECURITY DEFINER`, que:

- exige `business_context='sales'` nos dois lados e mesma `organization_id + contact_id + channel`, **sem** exigir endpoint igual (erro tipado `MERGE_NOT_SALES` / `MERGE_KEY_MISMATCH`);
- preserva `primary_endpoint_id` do winner (thread mais antiga = origem);
- deduplica `message_thread_reads` mantendo o `last_read_at` mais recente por usuário;
- reaponta mensagens, histórico de atribuição, tempos de resposta, agendamentos, tarefas e logs de IA, como a função atual;
- recalcula `last_message_*` do winner, reabre o winner se algum lado estava aberto, fecha o loser com `merged_into_thread_id`;
- grava auditoria em `message_thread_merge_audit` (compatível com `unmerge_message_thread`).

## 4. Ordem de execução (ao entrar em build mode)

1. **Vínculo inbound do Meta 2890** em `messaging_line_endpoints` (`is_active=true`), sem tocar `active_endpoint_id`.
2. **Backfill** das 142 threads do 5098 (`business_context = 'sales'`), com contagem antes/depois e checagem de que nada de Atendimento foi tocado.
3. **Migration** da RPC `merge_sales_threads`.
4. **Recalcular os grupos** (o backfill cria novos grupos, pois threads do 5098 passam a contar como `sales`) e executar o merge **somente dos grupos sem conflito de assignee e sem oportunidade divergente**; relatório dos pendentes.
5. **PARADA** nos grupos com assignee divergente — aguardando sua escolha do item 2.
6. **Webhooks V2** (`meta-whatsapp-webhook`, `twilio-whatsapp-webhook`, `evolution-webhook`): lookup `org + contato + channel + business_context='sales'`, independente de endpoint e status, com reabertura em vez de nova thread — aplicado **apenas** quando o endpoint receptor pertence a uma Route Comercial V2 **e** a flag está ligada para a org; caso contrário caminho legado idêntico. Nenhum ramo `customer_service` alterado.
7. **Outbound V2** pelo resolver autoritativo (thread → última inbound roteável → `messaging_line_endpoints` → Route → `active_endpoint_id` → provider), sem fallback silencioso; sem resolução ⇒ `REPLY_ROUTE_UNRESOLVED`.
8. **Testes** (paridade Meta/Twilio/Evolution, reopen, inbound por números diferentes, rotação 1111→3333, cliente voltando pelo 2890, Atendimento sem regressão) com a flag ainda OFF; shadow comparado por org.
9. **Unique** `message_threads (organization_id, contact_id, channel) WHERE business_context='sales' AND merged_into_thread_id IS NULL` — precedida por validação bloqueante `duplicidades sales = 0`; se > 0, aborta e reporta, sem improvisar merge.
10. **Flag** ligada só para a Viagi depois de todos os gates. Relatório final no formato solicitado.

**Fora do escopo:** Fase 3 (Timeline V2, Composer, UI de Routes), Route para a org `0cc6e2a4`, qualquer alteração de Atendimento.

---

Para eu começar, preciso de duas coisas: **build mode** e a **escolha da política de assignee** (recomendo A). Os passos 1–4 podem rodar imediatamente após isso; a unique e a flag ficam bloqueadas até os 7 grupos serem resolvidos.
