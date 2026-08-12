# FASE 2 — Migração Comercial (preview de roteamento histórico)

Nada foi escrito no banco. Abaixo o preview específico que você pediu, a semântica de `messaging_line_endpoints` e a execução ajustada.

---

## 1. Semântica: estado técnico ≠ associação à Route

Os dois conceitos já vivem em tabelas diferentes e não precisam de mudança de schema:

- `communication_endpoints.is_active` = **capacidade técnica atual** do número (recebe inbound novo, pode enviar). É o único campo consultado para decidir envio e para aceitar inbound novo.
- `messaging_line_endpoints.is_active` = **validade da associação Endpoint → Route**. Significa "este número pertence a esta Route", inclusive para números desligados. `false`/`unlinked_at` só é usado quando um administrador **desvincula** o número da Route (ex.: número devolvido ao provider e reatribuído a outra Route) — nunca para refletir estado técnico.

Verifiquei o gatilho de integridade criado na Fase 1 (`fn_validate_messaging_line_endpoint`): ele valida Route `sales`, mesma org e mesmo canal, e **não exige** `communication_endpoints.is_active`. Portanto vincular endpoints históricos inativos é permitido hoje, sem migration.

Consequência para o resolver outbound: a Route é descoberta pelo **endpoint da última inbound roteável**, mesmo que aquele número esteja tecnicamente inativo; o envio sempre sai pelo `active_endpoint_id` da Route (8439 na Viagi, 7067 na Central). O estado técnico continua governando inbound novo e capacidade de envio.

## 2. PREVIEW — última inbound roteável das threads Comerciais vivas

**Viagi (6.734 threads `sales`, canal whatsapp)**

| última inbound | provider | endpoint ativo? | mapping hoje | threads | resolve hoje? |
|---|---|---|---|---|---|
| 5098 | twilio | não | não | 3.075 | REPLY_ROUTE_UNRESOLVED |
| 2890 | meta_cloud_api | sim | não | 303 | REPLY_ROUTE_UNRESOLVED |
| 8439 | evolution_api | sim | sim | 403 | OK |
| sem inbound roteável | – | – | – | 2.953 | REPLY_ROUTE_UNRESOLVED |

Hoje: **403 resolvem / 6.331 falhariam**.

**Central Trabalhista (5.513 threads `sales`, canal whatsapp)**

| última inbound | provider | endpoint ativo? | mapping hoje | threads | resolve hoje? |
|---|---|---|---|---|---|
| 7067 | meta_cloud_api | sim | sim | 3.715 | OK |
| 7020 | meta_cloud_api | não | não | 1.181 | REPLY_ROUTE_UNRESOLVED |
| 7027 (Atendimento) | meta_cloud_api | sim | não | 4 | REPLY_ROUTE_UNRESOLVED |
| sem inbound roteável | – | – | – | 613 | REPLY_ROUTE_UNRESOLVED |

Hoje: **3.715 resolvem / 1.798 falhariam**.

**Resultado esperado após vincular os históricos (2890 + 5098 na Viagi, 7020 na Central):**

| org | resolvem | falham | motivo do que falha |
|---|---|---|---|
| Viagi | 3.781 (403 + 303 + 3.075) | 2.953 | thread nunca recebeu inbound com `endpoint_id` |
| Central | 4.896 (3.715 + 1.181) | 617 | 613 sem inbound roteável + 4 com última inbound no número de Atendimento |

Evidência de que o 7020 é deterministicamente o comercial anterior da mesma Route: Meta, `purpose='commercial'`, 9.986 inbounds entre 11/03 e 13/07/2026, hoje inativo; o 7067 (ativo, `active_endpoint_id`) começa em 11/07/2026 — handover limpo, mesma org e canal. Vinculo como inbound histórico, sem reativar e sem trocar `active_endpoint_id`.

**Threads sem inbound roteável — decidido:** as 2.953 (Viagi) + 613 (Central) threads sem nenhuma inbound com `endpoint_id` resolvem para **`REPLY_ROUTE_UNRESOLVED`**, sem exceção. Nenhuma heurística é permitida: nem Route única da org, nem `primary_endpoint_id`, `purpose`, último outbound ou provider default. Elas não bloqueiam construir e testar a Fase 2, mas ficam contabilizadas explicitamente no relatório antes de ligar a flag; a resolução operacional é UX explícita na Fase 3.

**Separação mapping × estado técnico no resolver:** o mapping histórico serve **apenas** para descobrir a Route a partir do endpoint da última inbound, inclusive com `communication_endpoints.is_active = false`. O envio usa sempre `Route.active_endpoint_id`, que precisa apontar para endpoint tecnicamente válido — nunca se tenta enviar pelo endpoint histórico. Da mesma forma, mapping ativo **não** torna um endpoint técnico inativo apto a receber inbound novo: a aptidão para inbound continua vindo de `communication_endpoints`.

## 3. Mappings a criar (nenhum outro)

| org | endpoint | papel | `mle.is_active` | altera `active_endpoint_id`? |
|---|---|---|---|---|
| Viagi | 8439 (evolution) | envio atual + inbound | true (já existe) | não |
| Viagi | 2890 (meta) | inbound histórico | true | não |
| Viagi | 5098 (twilio, inativo) | inbound histórico | true | não |
| Central | 7067 (meta) | envio atual + inbound | true (já existe) | não |
| Central | 7020 (meta, inativo) | inbound histórico | true | não |

Não são tocados: `communication_endpoints.is_active`, `provider`, mensagens antigas, `active_endpoint_id`, nada de Atendimento (o 7027 e o 2896 continuam sem mapping).

## 4. Execução aprovada (ordem)

1. Criar os 3 mappings históricos novos (2890, 5098, 7020).
2. Backfill das 142 threads determinísticas do 5098 → `business_context='sales'`.
3. Migration da RPC `merge_sales_threads` (a atual `merge_message_threads` recusa merge com `primary_endpoint_id` diferente e colide na chave de `message_thread_reads`; a nova exige `sales` + mesma org/contato/canal, deduplica leituras, preserva o `primary_endpoint_id` do winner e grava auditoria compatível com `unmerge_message_thread`).
4. Merge dos grupos sem conflito (winner = mais antiga), recalculando os grupos após o backfill.
5. Merge dos 7 grupos com assignee divergente pela **política A** (assignee = da thread com `last_message_at` mais recente): quando o assignee final difere do assignee do winner, gravar a transição em `thread_assignment_history` (thread winner, `from` = assignee do winner, `to` = assignee final, motivo `MERGE_SALES_V2`), preservando o histórico anterior e **sem sobrescrever** `original_owner_user_id`.
6. Webhooks V2 (Meta, Twilio, Evolution) e outbound resolver, atrás da flag, com o caminho legado intacto quando desligada; Atendimento sem nenhum ramo alterado.
7. Testes com flag OFF + shadow por org.
8. **Revisão obrigatória antes do merge destrutivo:** apresento a RPC final, os grupos recalculados após o backfill, a contagem final de winners/losers e qualquer conflito novo. O merge só roda depois dessa revisão.
9. Sem unique, sem ligar flag, sem Fase 3 nesta etapa.

Ao terminar, paro e entrego: mappings históricos finais, resultado do backfill, dry-run recalculado dos merges, contrato final da `merge_sales_threads`, shadow do resolver por organização, `REPLY_ROUTE_UNRESOLVED` restante, testes Meta/Twilio/Evolution e regressão de Atendimento.

---

Confirmando este preview e me colocando em **build mode**, executo os passos 1 a 7 e paro antes da unique/flag.
