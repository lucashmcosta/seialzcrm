# IMPACT ASSESSMENT v2 — GMUD Conversas Multicanal (corrigido e complementado)

Read-only. Nada implementado, nenhuma migration, nenhum código alterado. Números abaixo vêm de consultas ao banco de produção nesta sessão.

## A. Arquitetura correta (correção aceita)

Identidade futura da thread = `organization_id + contact_id + Inbox`, onde Inbox hoje é materializada por `message_threads.business_context` (`sales` | `customer_service`). Comercial e Atendimento **permanecem separados**; a unificação ocorre apenas entre múltiplos endpoints/routes **dentro da mesma Inbox**.

**Compatível com o ADR-0009?** Sim. O ADR-0009 separa domínios de negócio (Inbox/atendimento vs Messages/comercial), não endpoints. A GMUD, nesta leitura, *reforça* o ADR: o `business_context` deixa de ser atributo derivado e passa a ser parte da chave de identidade. A afirmação anterior ("a GMUD assume unificação e contradiz o ADR-0009") está **retirada** — não é necessário novo ADR para revogar o 0009; é necessário apenas um ADR curto elevando `business_context` a componente de identidade.

## B. Conflitos reais (recalculado pela identidade futura)

Threads abertas (`open`, `awaiting_client`, `in_progress`), agrupadas por `(organization_id, contact_id, business_context)`:

| Inbox | Grupos | Contatos com conflito | Threads em conflito |
|---|---|---|---|
| sales | 11.140 | **53** | 106 |
| customer_service | 31 | **0** | 0 |
| other | 28 | 0 | 0 |
| business_context NULL | 151 | 0 | 0 |

Considerando **todos os status** (histórico completo):

| Inbox | Grupos com >1 thread | Threads envolvidas | Grupos com endpoints diferentes |
|---|---|---|---|
| sales | 95 | 193 | 69 |
| customer_service | 20 | 45 | 2 |
| NULL | 1 | 3 | 0 |

Decomposição dos **695** pares `contato+canal` do relatório anterior:
- **568 (81,7%) não são conflito** — são exatamente uma thread `sales` + uma `customer_service` (comportamento desejado pela GMUD).
- 95 conflitos reais dentro de `sales`; 20 dentro de `customer_service`; 12 envolvem thread com `business_context NULL`; 2 envolvem `other`.

Distribuição dos conflitos por endpoint/provider/status/volume (principais):
- CS · Meta `+551150287027` · resolved: 40 threads, 1.882 msgs, maior 545.
- Sales · Meta `+551150287020`: 80 threads (33 awaiting, 27 open, 20 resolved), 2.038 msgs, maior 150.
- Sales · Meta `+551150287067`: 67 threads, 1.308 msgs, maior 128.
- Sales sem endpoint (`primary_endpoint_id NULL`): 21 threads, 288 msgs.
- Sales · Twilio `+551150265098`: 10 threads · Meta `+551150262890`: 8 · Evolution `+5511936198439`: 1 (CS, 123 msgs).

**Conclusão B:** o esforço de merge é de ordem de grandeza pequena (≈116 grupos / ≈238 threads), não 695. É tratável com script auditado e revisão manual dos casos com endpoints distintos (69 + 2).

## C. Threads com `business_context IS NULL`

Total **159** — 137 `open`, 14 `awaiting_client`, 8 `resolved`.

| Endpoint/purpose | Provider | lifecycle | Qtd | Classificação |
|---|---|---|---|---|
| commercial | twilio | lead/customer | 142 | **sales** (determinístico via `purpose`) |
| commercial | meta_cloud_api | customer/lead | 2 | **sales** (determinístico) |
| commercial | evolution_api | lead | 2 | **sales** (determinístico) |
| sem endpoint | — | lead (7 open) | 7 | **ambígua** |
| sem endpoint | — | customer (6 resolved) | 6 | **ambígua** |

146 de 159 (91,8%) classificáveis deterministicamente por `communication_endpoints.purpose` (regra já existente em `src/lib/endpointPurpose.ts`, não inventada). **13 são ambíguas** e precisam de decisão humana — não há dado suficiente para classificar (`lifecycle_stage` não é regra de Inbox; usá-lo seria inventar regra).

## D. Identidade futura — consumers e classificação

| Consumer | Classificação |
|---|---|
| Índices `message_threads_unique_open_per_contact_endpoint` / `..._legacy` | **ESTRUTURAL** (substituídos por chave com `business_context`) |
| `business_context` hoje nullable + `trg_message_threads_autofill_business_context` | **ESTRUTURAL** (passa a NOT NULL / chave) |
| `merge_message_threads` / `unmerge_message_thread` | **ESTRUTURAL** (ver item E — hoje recusa o caso da GMUD) |
| `meta-whatsapp-webhook` (lookup por `primary_endpoint_id`) | **ESTRUTURAL** |
| `twilio-whatsapp-webhook` (lookup + fallback legacy + backfill de endpoint) | **ESTRUTURAL** |
| `evolution-webhook` (`findOrCreateThread` + `THREAD_PROVIDER_MIGRATED`) | **ESTRUTURAL** — porém já é o mais próximo do modelo alvo (reaproveita thread e troca endpoint) |
| `promote_session_to_contact` (webchat) | **SIMPLES** (já busca por `business_context` derivado do purpose) |
| `dispatchWhatsAppSend` (cliente) + `_shared/dispatch-whatsapp-send` (edge) | **ESTRUTURAL** (dois dispatchers divergentes; passam a resolver Route pela Inbox) |
| Re-route hardcoded (`407ff93d-…`) e `complianceGuards.ts` (endpoint 7020, janela de 7 dias vencida) | **SIMPLES** (remoção) |
| `rpc_list_message_threads` (2 overloads), `rpc_get_message_threads_by_ids` | **SIMPLES** (filtro por Inbox já existe implicitamente) |
| `rpc_list_inbox_threads`, `rpc_inbox_queue_counts`, `inboxScope.ts` | **SIMPLES** |
| `MessagesList.tsx`, `InboxPage/InboxThreadDetail`, `MobileMessagesList`, `MobileInbox` | **SIMPLES→ESTRUTURAL** (timeline unificada exige divisor "número mudou", já existente via `useEndpointNumbers`) |
| `NewConversationDialog` + `composerEndpoint.ts` (`pickPreferredEndpoint`) | **ESTRUTURAL** (escolher Route, não endpoint) |
| `useThreadSendEndpoint`, `useThreadEndpointMap`, `resolveComposerProvider` | **ESTRUTURAL** (viram leitura de Route; `resolveComposerProvider` deve morrer) |
| `scheduled_messages` (`thread_id`) | **SIMPLES** (endpoint resolvido no envio) |
| Templates (`whatsapp_templates` por WABA/endpoint) | **SIMPLES** — atenção: template é ligado à WABA; a Route define qual conjunto é válido |
| IA (`ai-agent-respond`, `ai_agent_logs`, limite por thread) | **SIMPLES** — mas o limite por thread muda de semântica ao consolidar |
| Realtime (`message_threads` INSERT/UPDATE; `messages` por thread) | **SIMPLES** (menos threads, mais eventos por thread) |
| `messages.endpoint_id` | **SEM ALTERAÇÃO** (já é o endpoint real da mensagem — é o pilar do modelo novo) |
| `message_thread_reads`, `thread_assignment_history`, `message_response_times` | **SEM ALTERAÇÃO** estrutural, afetados apenas no merge |

## E. `merge_message_threads` **não** serve ao caso da GMUD

Verificado no corpo da função: ela **levanta exceção** quando `primary_endpoint_id` OU `business_context` divergem entre winner e loser (`merge_message_threads refused: grouping key mismatch`). O caso central da GMUD — mesmo contato, mesma Inbox, **endpoints diferentes** — é explicitamente recusado hoje.

O que ela já faz bem (reutilizável como base): move `messages` (com `merged_from_thread_id`), `message_thread_reads`, `thread_assignment_history`, `message_response_times`, `scheduled_messages`, `tasks`, `ai_agent_logs`, `ai_interaction_logs`; fecha o loser com `merged_into_thread_id`; recalcula `last_message_*`; grava `message_thread_merge_audit`; usa lock ordenado por id (evita deadlock) e é idempotente.

O que **não** trata e precisa de definição antes de qualquer plano:
- qual `primary_endpoint_id` sobrevive (e se o campo deixa de ter significado de identidade);
- conflito de `assigned_user_id` e de SLA (`first_response_at`, `resolved_at`, filas);
- conflito de `opportunity_id` entre threads;
- escolha de `status` do winner (open vs awaiting_client vs resolved);
- `unmerge_message_thread` para um merge multi-endpoint (reversibilidade);
- efeito em `message_response_times` já calculado (métricas de vendedor mudam retroativamente).

**Conclusão E:** a RPC não deve ser adotada automaticamente. Ela é ponto de partida, não solução.

## F. 4.764 mensagens sem `endpoint_id`

| Grupo | Qtd | Backfill |
|---|---|---|
| Threads **sem** `primary_endpoint_id`, sales, inbound/outbound (04/2026–07/2026) | 3.545 | **Impossível determinar** sem outra fonte (só inferível por provider/período) |
| Notas internas (`direction='internal'`) | 603 | **Não se aplica** — nota interna não tem endpoint por definição |
| Threads **com** `primary_endpoint_id` (sales 480, CS 117, outros) | ~600 | **Determinístico** (herda o endpoint da thread) |
| `business_context NULL`, inbound, sem endpoint | 3 | Impossível |
| `channel='internal'` | 3 | Não se aplica |

**É bloqueador da GMUD?** Não. `messages.endpoint_id` nulo só afeta a exibição do badge "via …" e o divisor de troca de número. A nova identidade da thread não depende de `messages.endpoint_id`.

**Como a Timeline deve exibir:** mensagens sem endpoint entram na sequência cronológica sem badge de número (e sem gerar divisor "número mudou"), herdando visualmente o bloco anterior. Notas internas seguem com estilo próprio. Nenhum backfill é pré-requisito.

## G. Inbound — regra futura por webhook

Regra: `webhook → endpoint recebido → Route → Inbox → thread(contact+Inbox) → message com endpoint real`. Route determina **contexto**, não identidade.

- **Meta** (`meta-whatsapp-webhook`): trocar o lookup de thread (hoje filtra `primary_endpoint_id=endpoint.id`) por filtro em `business_context` derivado do `purpose` do endpoint; manter `messages.endpoint_id`; o log `duplicate_thread_detected` passa a ser sinal de conflito real. O gate BR inline (próprio, diferente de Twilio/Evolution) é dívida separada.
- **Twilio**: remover os dois fallbacks (thread legada com endpoint nulo e lookup sem filtro de endpoint) — eles deixam de existir porque a chave não usa endpoint; manter o backfill de `messages.endpoint_id` nos status callbacks.
- **Evolution**: eliminar o passo 2 (migração de provider) — ele deixa de ser necessário, pois a thread já é a mesma; manter o evento de sistema como registro de troca de número.
- **Webchat** (`promote_session_to_contact`): menor impacto; já deriva `business_context` do `purpose`. Ajuste: parar de criar oportunidade sem consultar `auto_create_opportunity` (divergência de negócio real, independente da GMUD).

## H. Outbound — contrato

Contrato desejado é implementável, com uma lacuna: **hoje não existe vínculo Route→endpoint reverso confiável**. `messaging_lines` só guarda `active_endpoint_id` (1 endpoint por `key`), então "dado o endpoint do último inbound, qual Route?" só é respondível quando esse endpoint ainda é o ativo. Endpoints rotacionados (ex.: 2890 → 8439) perdem a associação — não há histórico consultável além de `messaging_line_rotations` (log, não FK). Sem um vínculo persistente endpoint→Route, a resolução por "último inbound" degrada silenciosamente, exatamente o que se quer evitar. Quando não houver Route válida: erro explícito no envio (sem fallback silencioso, sem default Twilio — que hoje existe e deve ser removido).

## I. `messaging_lines` — o que impede N Routes por Inbox

Colunas: `id`, `organization_id`, `key`, `name`, `channel`, `active_endpoint_id`, `created_at`, `updated_at`.
Constraints: `UNIQUE (organization_id, key, channel)`; `CHECK key IN ('commercial','customer_service','evolution_pilot')`; FK `active_endpoint_id → communication_endpoints ON DELETE SET NULL`.

Impedimentos para N Routes por Inbox: (1) o `UNIQUE` amarra 1 linha por `key`; (2) o `CHECK` fixa o vocabulário e mistura Inbox com piloto (`evolution_pilot`); (3) não há coluna de Inbox separada de `key`, nem prioridade/ordem, nem `is_active`, nem dono (`Route João`/`Route Maria` exigiria `owner_user_id`), nem vínculo N:1 endpoint→Route.
Consumers: os dois dispatchers, `useThreadSendEndpoint`, e o log `messaging_line_rotations`. Nenhuma UI de administração de linhas foi encontrada — rotação é feita por SQL.

## J. Performance da Timeline — números

Mensagens por thread:

| Inbox | Threads | Média | p50 | p90 | p95 | p99 | Maior | >100 | >500 | >1.000 |
|---|---|---|---|---|---|---|---|---|---|---|
| sales | 12.496 | 11,5 | 4 | 29 | 48 | 111 | 451 | 153 | 0 | 0 |
| customer_service | 6.508 | 19,9 | 6 | 50 | 89 | 185 | 545 | 276 | 1 | 0 |
| NULL/other | 189 | ~1 | 1 | 2 | 3 | 3 | 39 | 0 | 0 | 0 |

Nenhuma thread passa de 1.000 mensagens. Consolidando os grupos em conflito, o pior caso somado observado fica na casa de ~700 mensagens (grupo CS de 40 threads / 1.882 msgs está espalhado por vários contatos; o maior grupo individual soma centenas, não milhares).

**Veredito:** paginação e virtualização **não são bloqueadores da migration de dados** e não são bloqueadores de backend. São bloqueadores de qualidade para **ativar a nova UX** — e o limite fixo de `.limit(500)` no Inbox passa a ser um bug visível (276 threads já >100, 1 já >500). O risco anterior de "regressão perceptível" está **rebaixado de crítico para médio**.

## K. Ingest core compartilhado — análise crítica (A vs B)

| Critério | Opção A (refatorar ingest primeiro) | Opção B (mudar identidade nos 3 webhooks, consolidar depois) |
|---|---|---|
| Blast radius | Todo o inbound dos 3 providers de uma vez | Um provider por vez |
| Risco de regressão | Alto (mistura refactor + mudança de regra) | Menor (mudança pontual: 1 filtro de lookup por webhook) |
| Rollback | Difícil (revert de refactor grande com tráfego vivo) | Simples por provider |
| Complexidade | Alta | Baixa por passo, alta soma total |
| Tempo até valor | Longo | Curto |
| Dívida | Resolve dívida antes | Mantém a dívida da tríplice duplicação |

**Conclusão:** a pré-condição anterior está **retirada**. A mudança concreta em cada webhook é pequena e equivalente (trocar o predicado do lookup de thread e remover fallbacks), e Evolution já opera perto do modelo alvo. **Opção B é a recomendada**, com uma exigência: os três predicados devem ser escritos idênticos e cobertos por teste, senão a divergência se agrava.

## L. Bloqueadores, separados por natureza

**Bloqueador para a migration de dados**
1. Definir a política de merge (winner, endpoint sobrevivente, status, assignee, SLA, `opportunity_id`) — `merge_message_threads` hoje recusa o caso.
2. Decidir as 13 threads `business_context NULL` ambíguas.
3. `business_context` precisa virar NOT NULL antes de entrar na chave única.
4. Merge/backfill em lote pequeno com cron pausado (12 triggers em `messages`, ADR-0007).

**Bloqueador de backend**
5. Vínculo persistente endpoint→Route (item H) e `messaging_lines` suportando N Routes (item I).
6. Consolidar os dois dispatchers em um único contrato antes de mudar a chave de roteamento.
7. Remover o default silencioso para Twilio e o re-route hardcoded.

**Bloqueador para ativar a UX**
8. Paginação da timeline (e remoção do `.limit(500)` do Inbox).
9. Virtualização + memoização das timelines.
10. Divisor "número mudou" na timeline consolidada e badge por mensagem.

**Dívida técnica que pode ficar para depois**
11. Ingest core compartilhado.
12. `complianceGuards.ts` hardcoded (janela de 7 dias já vencida).
13. Backfill dos 4.764 `messages.endpoint_id` (3.545 são indeterminados de todo modo).
14. `migrateThreadAndSend.ts` sem call sites; `resolveComposerProvider` a remover.
15. Overloads duplicados de `rpc_list_message_threads`.
16. Webchat ignorando `auto_create_opportunity`.

## M. Go / No-Go

**Podemos gerar o Plano Técnico de Implementação? SIM.**

Premissas suficientemente validadas para planejar:
- Arquitetura alvo (`contact + Inbox`) é compatível com o ADR-0009 e mensurável no banco hoje.
- Volume de conflito é pequeno e conhecido: 53 contatos abertos em `sales`, 0 em `customer_service`; 116 grupos considerando todo o histórico.
- 91,8% das threads sem `business_context` são classificáveis deterministicamente; as 13 restantes estão isoladas e listadas.
- Performance não bloqueia migration nem backend; bloqueia apenas a ativação da UX, com números conhecidos (nenhuma thread >1.000 msgs).
- Os pontos de mudança inbound/outbound estão mapeados arquivo por arquivo.
- Opção B (webhooks separados primeiro) tem risco/rollback aceitáveis.

Duas decisões de produto precisam ser tomadas **dentro** do plano (não bloqueiam escrevê-lo): política de merge (item E) e modelo de Route (itens H/I).
