# FASE 2 — Migração Comercial (Conversas Multicanal)

Estou em modo de planejamento, então nada foi alterado. Abaixo estão os previews e dry-runs read-only que você exigiu antes de qualquer escrita, mais o roteiro exato da Fase 2. Há **um ponto de decisão obrigatório** (item 1) e **um segundo ponto que o preview revelou e o plano original não previa** (item 2).

---

## 1. PREVIEW OBRIGATÓRIO — Meta 2890 da Viagi

| Campo | Valor |
|---|---|
| endpoint_id | `34d9ec9d-f084-41f4-aeb1-ea4de7b335e4` |
| número | +55 11 5026‑2890 |
| provider | meta_cloud_api |
| purpose | commercial |
| is_active | true |
| threads com ele como `primary_endpoint_id` | 666 |
| mensagens com `endpoint_id` = 2890 | 2.124 (1.033 inbound, 1.091 outbound) |
| janela de uso | 07/07/2026 → 01/08/2026 (inbound), outbound até 21/07/2026 |
| threads tocadas por mensagens dele | 514 |

`business_context` das threads dele: **sales 665** (71 open, 586 awaiting_client, 8 resolved) e **customer_service 1** (resolved, 07/07).

Leitura operacional: o 2890 foi o **número comercial Meta em produção da Viagi entre 07/07 e 01/08**, com inbound e outbound reais, substituído depois pelo Evolution 8439 (que já é o `active_endpoint_id` da Route Comercial). Ou seja, ele é um **endpoint comercial histórico da mesma Route**, não um número de outro contexto — o único registro de `customer_service` é 1 thread isolada do primeiro dia, contra 665 de vendas.

**Decisão que preciso de você (não vou inferir por `purpose`):**

- **(A) Recomendada** — vincular o 2890 à Route Comercial da Viagi **apenas como endpoint inbound** em `messaging_line_endpoints` (`is_active = true`), sem tocar em `active_endpoint_id`. Efeito: cliente que responder no número antigo cai na mesma Thread Comercial e a resposta sai pelo 8439. Sem isso, esses clientes voltam com `REPLY_ROUTE_UNRESOLVED`.
- **(B)** deixar o 2890 fora de qualquer Route. Efeito: 665 threads comerciais ficam sem rota de resposta quando o cliente reaparecer por ele.

## 2. PONTO NOVO — Twilio 5098 (legado, Viagi)

O preview do Comercial da Viagi revelou um endpoint que o plano não tratava: `672a0845-…` / +55 11 5026‑5098, provider twilio, `purpose='commercial'`, **`is_active = false`**, com **5.762 threads** (5.620 já `business_context='sales'`) e **50.314 mensagens**, ativo de 12/02 a 07/07/2026. É o número comercial anterior ao 2890.

Como está inativo, a RPC de rotação e o vínculo inbound o recusariam hoje (`ROTATION_ENDPOINT_INACTIVE`). Opções — também precisam da sua decisão:

- **(A)** vincular como inbound histórico da Route Comercial (exige permitir vínculo de endpoint inativo apenas para inbound legado);
- **(B) Recomendada para esta fase** — não vincular; o número não recebe mais inbound (Twilio desligado), e as 5.620 threads continuam sendo unificadas por contato pelo merge. Não gera `REPLY_ROUTE_UNRESOLVED` porque não há inbound novo por ele.

Central Trabalhista tem situação equivalente com o Meta 7020 (1.436 threads sales, endpoint inativo) — mesma decisão se aplica.

---

## 3. DRY-RUN — Backfill de `business_context` → `sales`

Regra: só entram threads **determinísticas**, cujo `primary_endpoint_id` é um endpoint comercial pertencente a uma Route Comercial V2 (ou ao conjunto comercial histórico da org). `lifecycle_stage` não é usado.

**Serão alteradas (142 threads, todas Viagi):**

| endpoint | provider | status | threads |
|---|---|---|---|
| 5098 | twilio | open | 127 |
| 5098 | twilio | awaiting_client | 13 |
| 5098 | twilio | resolved | 2 |

**Não serão alteradas (ambíguas, ficam intactas):**

- 2 threads no Evolution 8439 com contexto nulo → só entram se a decisão do item 1/2 confirmar (são 2 registros, prefiro deixar de fora).
- 2 threads no Meta 7020 (Central) com contexto nulo.
- 10 threads `sales` apontando para endpoint de Atendimento (Central 7027) e 4 threads `customer_service` em endpoint comercial da Viagi → **não toco**, são inconsistências de origem.
- 33 threads sem `primary_endpoint_id` e 26 com contexto `other` sem endpoint → sem evidência determinística.
- 1 thread `channel='internal'`.

## 4. DRY-RUN — Merge Comercial (unificação por contato)

Grupos onde existe mais de uma thread `sales` para o mesmo `organization_id + contact_id + channel`:

| classe | grupos | threads | conflito |
|---|---|---|---|
| Par simples (2 threads) | 82 | 164 | nenhum |
| 3+ threads | 2 | 6 | nenhum |
| Assignee divergente | 10 | 21 | **sim — fora do lote automático** |
| **Total** | **94** | **191** | — |

Distribuição: 85 grupos na Central, 9 na Viagi. **Grupos com duas oportunidades abertas: 0. Grupos com oportunidades distintas: 0** (nenhuma dessas threads carrega `opportunity_id`). 69 grupos envolvem endpoints diferentes — exatamente o caso que a GMUD quer unificar.

Política de merge: **winner** = thread mais antiga por `created_at` (preserva histórico e `primary_endpoint_id` de origem); losers têm mensagens, atividades, leituras e vínculos reapontados; `last_message_at`/`unread` recalculados; status final = mais "aberto" do grupo; auditoria em `message_thread_merge_audit`. Executo **84 grupos** (par + 3+); os **10 grupos com assignee divergente ficam pendentes** para você decidir o responsável.

---

## 5. Execução proposta da Fase 2 (após suas decisões)

1. **Vínculos inbound** conforme decisão dos itens 1 e 2 (nenhum vínculo automático por `purpose`).
2. **Backfill** das 142 threads determinísticas, em transação, com contagem antes/depois.
3. **Merge** dos 84 grupos sem conflito, com auditoria; relatório dos 10 pendentes.
4. **Índice unique** `message_threads (organization_id, contact_id, channel) WHERE business_context='sales' AND deleted_at IS NULL` — criado somente depois que o merge zerar duplicidades; Atendimento não é coberto pelo índice.
5. **Inbound V2** em `meta-whatsapp-webhook`, `twilio-whatsapp-webhook` e `evolution-webhook`: lookup passa a ser `org + contato + channel + business_context='sales'`, **independente de endpoint e status**, com reabertura (`THREAD_REOPENED`) em vez de nova thread. Alteração aplicada **somente** quando o endpoint receptor pertence a uma Route Comercial V2 e a flag está ligada para a org; caso contrário o caminho atual é preservado byte a byte. Nenhum ramo `customer_service` é tocado.
6. **Outbound V2** passa a usar o resolver autoritativo (thread → última inbound roteável → `messaging_line_endpoints` → Route → `active_endpoint_id` → provider), sem fallback silencioso; sem resolução ⇒ `REPLY_ROUTE_UNRESOLVED`.
7. **Shadow antes de ligar**: resolver rodando em paralelo, divergência medida por org. A flag `conv_route_resolver_v2` é ligada **apenas para a Viagi (piloto)** depois de backfill validado, merge concluído, webhooks prontos e divergência aceitável. Nunca global.
8. **Testes** e relatório final no formato que você pediu (paridade Meta/Twilio/Evolution, reopen, inbound por números diferentes, rotação 1111→3333, cliente voltando pelo número antigo, Atendimento sem regressão, resolver por org, flag por org).

**Fora do escopo:** Timeline V2, Composer novo, UI de Routes, criação de Route para a org `0cc6e2a4` (permanece fora do Comercial V2), qualquer alteração de Atendimento (lookup, SLA, fila, assignment, reopen, mappings, identidade).

## 6. Detalhes técnicos

- Migrations da Fase 2: backfill + merge + índice unique parcial, cada etapa em transação própria com validação bloqueante ao final (0 duplicidades `sales` antes de criar o índice).
- `messaging_line_endpoints` só recebe endpoints comerciais; o trigger de integridade da Fase 1 recusa canal/org divergentes e Routes de Atendimento.
- Webhooks: a nova busca fica atrás de um helper compartilhado, com o caminho legado intacto quando a flag está desligada, permitindo rollback por flag sem redeploy.
- Nenhuma alteração de frontend nesta fase.

---

**Preciso das suas decisões nos itens 1 e 2 antes de qualquer escrita.** Aprovar este plano com a recomendação (1‑A + 2‑B) já é suficiente para eu executar.
