# PLANO TÉCNICO — GMUD Conversas Multicanal (4 fases)

Base: Impact Assessment v2 e as auditorias já realizadas. Arquitetura alvo inalterada. Nada implementado nesta etapa.

**Escopo real:** o problema é **Comercial** — múltiplos números, números compartilhados, números pessoais de vendedor, múltiplos providers, tudo na mesma conversa e na mesma Inbox Comercial. O Atendimento entra apenas para ficar compatível com o novo modelo de Route; **seu comportamento operacional não muda** (um número, SLA, fila, assignment, reopen e lifecycle atuais preservados).

**Flags (apenas 2):** `conv_route_resolver_v2` (roteamento inbound+outbound) e `conv_timeline_v2` (timeline paginada + blocos por endpoint + composer). Nada mais.

---

## Modelo (recap normativo)

- **Thread** = `organization_id + contact_id + Inbox`. `Inbox ∈ {sales, customer_service}`. Comercial e Atendimento permanecem separados (ADR-0009).
- **`channel` não faz parte da identidade** — verificado no banco: 0 contatos com threads em mais de um canal na mesma Inbox. Fica como campo de exibição/compatibilidade.
- **Route** = identidade operacional dentro de uma Inbox (Comercial Principal, Comercial Secundária, João, Maria). N Routes por Inbox. Inbound: N endpoints por Route (`route_inbound_endpoints`), um endpoint ativo em uma Route por vez. Outbound: um `active_endpoint_id` por Route.
- **Outbound:** `thread → última mensagem inbound roteável → Route → Route.active_endpoint_id → provider`. *Inbound roteável* = `direction='inbound'` **e** `endpoint_id IS NOT NULL` **e** endpoint com associação ativa em `route_inbound_endpoints`, ordem `sent_at DESC, id DESC`. Sem isso ⇒ erro tipado **`REPLY_ROUTE_UNRESOLVED`**. Proibido: `primary_endpoint_id`, `purpose`, último outbound, provider default, qualquer fallback silencioso.
- **Lifecycle por Inbox (correção importante):**
  - **`sales`** — conversa única e perene: lookup por `org + contact + Inbox` **independente do status**; thread resolvida é **reaberta** (`THREAD_REOPENED`), nunca duplicada. Unique **total** `(organization_id, contact_id, business_context)` restrita a `business_context='sales'`.
  - **`customer_service`** — lifecycle atual **preservado**: fila, SLA, reopen e assignment como hoje; nada de thread eterna. Ganha só a capacidade estrutural de ter N endpoints inbound por Route.
- `primary_endpoint_id` deixa de rotear e passa a significar endpoint de origem. `purpose` só serve como insumo de backfill.

---

## Fase 1 — Schema de Route + Resolver único + backfill de contexto

Entrega única: as tabelas nascem já sendo usadas pelo resolver, atrás de flag.

**Schema (migration aditiva, com GRANTs e RLS por `organization_id = ANY(current_user_org_ids())`):**
- `messaging_routes` — org, `inbox`, `name`, `slug`, `channel`, `active_endpoint_id`, `owner_user_id` (número pessoal de vendedor), `is_active`, `priority`. Unique `(org, channel, slug)`; sem unicidade por inbox.
- `route_inbound_endpoints` — `route_id`, `endpoint_id`, `is_active`, `linked_at`, `unlinked_at`; índice único parcial garantindo um endpoint ativo em no máximo uma Route.
- `route_rotations` — auditoria de troca de `active_endpoint_id`.
- `integration_inbound_events`: novo `process_status` para inbound sem Route.
- Seed das Routes derivado de `messaging_lines` + `purpose`, revisado à mão (20 endpoints ativos).

**Resolver (`supabase/functions/_shared/route-resolver.ts`):** contrato único inbound/outbound descrito acima; consumido por `_shared/dispatch-whatsapp-send.ts`, `meta-whatsapp-send`, `twilio-whatsapp-send`, `evolution-whatsapp-send`; `src/lib/dispatchWhatsAppSend.ts` e `useThreadSendEndpoint` passam a apenas ler o resultado. Removidos aqui: `REROUTE_ORG_ID`, `REROUTE_TARGET_ENDPOINT_ID`, `salesContextMismatch` client-only, default Twilio, "último endpoint" como fallback, `resolveComposerProvider`.

**Backfill de `business_context`:** 146 threads determinísticas via `purpose`; 13 ambíguas em fila de revisão humana. Lotes pequenos com cron pausado (12 triggers em `messages`; ADR-0007). `NOT NULL` fica para a Fase 2.

**Observabilidade:** eventos `route_resolution_attempt`, `route_resolution_divergence`, `unrouted_inbound`, `reply_route_unresolved`, `thread_created`/`thread_reused`/`thread_reopened`, expostos em `service-health` e `service-events`. Alerta imediato para `unrouted_inbound`.

**Rollout:** flag `conv_route_resolver_v2` off = comportamento atual; o resolver roda em **shadow** logando divergência. Flip por org só com divergência 0 por 48h e toda ocorrência de `REPLY_ROUTE_UNRESOLVED` explicada.
**Aceite:** 100% dos endpoints ativos em exatamente uma Route; `business_context NULL` → 13 → 0; divergência 0 em shadow.
**Rollback:** flag off (código) e migration inversa aditiva (schema).

---

## Fase 2 — Inbound unificado + consolidação do Comercial + identidade final

Os três webhooks mudam na **mesma entrega** (não há dependência técnica entre providers) e o predicado de lookup passa a ser idêntico nos três, garantido por teste de paridade.

**Inbound (`meta-whatsapp-webhook`, `twilio-whatsapp-webhook`, `evolution-webhook`):** lookup por `org + contact + business_context` derivado da Route, sem filtro de canal. Em `sales`, sem filtro de status, com reopen. Em `customer_service`, o comportamento de status/fila/SLA atual é mantido. `messages.endpoint_id` continua sendo o endpoint real recebido. Remoções: filtro por endpoint no lookup (Meta), os dois fallbacks de thread legada (Twilio), o passo de migração de provider da thread (Evolution — o evento de sistema de troca de número permanece).

**Consolidação (Comercial):** RPC nova `merge_threads_sales_v1` (a `merge_message_threads` atual recusa endpoints/contextos diferentes; herda só a mecânica de movimentação e auditoria). Escopo: duplicadas por `(org, contact, 'sales')` em qualquer status — os 53 conflitos de abertas mais os grupos com resolvidas, volume final apurado no dry-run. Tabelas repontadas: `messages` (`merged_from_thread_id`), `message_thread_reads`, `thread_assignment_history`, `scheduled_messages`, `tasks`, `ai_agent_logs`, `ai_interaction_logs`, com snapshot em `message_thread_merge_audit`. `message_response_times`, `first_response_at`, `resolved_at` e rollups fechados (`seller_metrics_daily`) **não** são recalculados. Atendimento não é consolidado.

**Política de consolidação (aprovar antes de executar o merge):** `primary_endpoint_id` = mais recente; `assigned_user_id` = da thread com atividade mais recente, com evento em `thread_assignment_history`; `original_owner_user_id` = mais antigo; `opportunity_id` = a aberta, duas abertas ⇒ revisão manual; `status` = o mais aberto; `priority` = máximo; `first_response_at` preservado por thread original; `category` = mais recente não-nula; `needs_human_attention` = OR. `message_thread_reads` deduplicado por usuário (pode marcar como lido algo não lido — decisão explícita).

**Identidade final (fecha a fase):** `business_context` → NOT NULL; unique total `(organization_id, contact_id, business_context)` restrita a `sales`; uniques por endpoint removidas; Atendimento mantém sua garantia atual.

**Rollout:** mesma flag `conv_route_resolver_v2`, por org, começando pela org piloto de menor volume. Merge: dry-run com relatório por grupo → aprovação humana → lotes com cron pausado.
**Aceite:** zero thread nova para contato+Inbox existente (inclusive quando resolvida, em `sales`); zero grupo duplicado em `sales`; índice criado sem violação; nenhuma regressão no Atendimento (SLA, fila, reopen, assignment).
**Rollback:** flag off; `unmerge` validado no dry-run antes do merge; migration inversa restaurando as uniques antigas.

---

## Fase 3 — Timeline, blocos por endpoint, composer e administração de Routes

Uma entrega de UX completa atrás de `conv_timeline_v2`, porque a conversa consolidada só é usável com paginação e identificação de número.

- **Timeline paginada e virtualizada:** RPC de mensagens por cursor (`sent_at, id`); fim do `.limit(500)`; carregamento incremental, memoização das linhas, realtime que insere sem invalidar a janela. Arquivos: `src/pages/messages/MessagesList.tsx`, `src/components/inbox/InboxConversationTimeline.tsx`, `src/hooks/inbox/useInboxThreadMessages.ts`, `src/components/mobile/MobileMessagesList.tsx`, `MobileInbox.tsx`, novo `useThreadMessagesPaged`.
- **Blocos por endpoint (estilo Kommo):** `Dia → Bloco de Endpoint → Mensagens consecutivas`. Voltar a um endpoint anterior cria novo bloco (1111→2222→7777→1111 = 4 blocos). Mensagens sem `endpoint_id` não herdam endpoint, não quebram bloco e vão sem badge. Notas internas sem endpoint. Blocos são **render**, não tabela — nada de `conversation_blocks`/`timeline_groups`.
- **Composer:** "Respondendo por: WhatsApp João 7777", read-only, lendo o resolver nas três superfícies (`MessagesList`, `InboxComposer`, `MobileMessagesList`) — hoje o InboxComposer segue caminho próprio e escolhe template do provider errado. Gate de janela/template pelo `requires_template_outside_window` do endpoint efetivo.
- **Administração de Routes:** telas em `src/pages/settings/` + Edge de rotação com auditoria em `route_rotations`. Trocar `active_endpoint_id` não desassocia o endpoint antigo do inbound (fica inbound-only), não cria thread e não altera mensagens. Fim da rotação por SQL manual.

**Aceite:** thread de 545 msgs abre em <1s; provider/templates exibidos coincidem 100% com o que o backend usará; rotação reproduzível pela UI; paridade mobile.
**Rollback:** flag off (UI volta ao render atual; backend já é o novo).

---

## Fase 4 — Estabilização e remoção do legado

Após ≥2 semanas com as flags 100% ligadas e sem incidentes.

- Remover `messaging_lines` e `messaging_line_rotations` (sucedidos por `messaging_routes`/`route_rotations`).
- `primary_endpoint_id` → `origin_endpoint_id`; `purpose` marcado deprecated.
- Remover `complianceGuards.ts` hardcoded (janela de 7 dias vencida), `migrateThreadAndSend.ts` (sem call sites), overloads duplicados de `rpc_list_message_threads`, `endpoint-migration-note.ts` transicional.
- Remover as duas flags e os caminhos duplos.
- Documentação: atualizar `docs/modules/messages/`, `docs/modules/inbox/`, `docs/plans/2026-07-endpoint-lines-rotation.md` e registrar ADR de Route + identidade da Thread.

**Aceite:** nenhuma referência viva ao caminho antigo; métricas comerciais e SLA de atendimento estáveis vs. baseline pré-GMUD.

---

## Matriz de testes (vale para as Fases 1–3)

| # | Cenário | Esperado |
|---|---|---|
| 1 | Comercial com 1 endpoint | 1 thread; envio pelo `active_endpoint` |
| 2 | Comercial com N endpoints | 1 thread; N blocos/badges |
| 3 | Comercial Principal + Secundária | resposta pela Route do último inbound roteável |
| 4 | Número pessoal do vendedor (Route João) | resposta por 7777 |
| 5 | Meta + Twilio na mesma Inbox | 1 thread; provider correto por bloco |
| 6 | Meta + Evolution na mesma Inbox | free-form conforme `requires_template_outside_window` |
| 7 | Rotação 1111→3333 | mesma Route, mesma thread, envio por 3333 |
| 8 | Cliente volta pelo número antigo | mesma thread; mensagens antigas intactas |
| 9 | Comercial resolvido e cliente escreve de novo | mesma thread reaberta; zero thread nova |
| 10 | Contato fala Comercial e Atendimento | 2 threads, uma por Inbox |
| 11 | Sem inbound roteável | `REPLY_ROUTE_UNRESOLVED`; nenhum fallback |
| 12 | Última inbound com `endpoint_id` nulo | resolve pela anterior roteável |
| 13 | Endpoint inbound sem Route | evento não roteado + alerta; nada gravado no domínio |
| 14 | Route sem `active_endpoint_id` | envio recusado com erro claro |
| 15 | Atendimento (regressão) | fila, SLA, reopen e assignment idênticos ao baseline |
| 16 | Realtime | mensagem nova sem duplicar na thread única |
| 17 | Scheduled message | endpoint resolvido no envio, não no agendamento |
| 18 | IA | responde na thread única; limite por thread revisto |
| 19 | Mobile | paridade nos itens 1–10 |

---

## Riscos

1. Unique key da Fase 2 antes de a consolidação zerar duplicadas em `sales` → índice não cria. Mitigação: unique é o último passo da fase.
2. Resolver ligado sem shadow → roteamento errado em massa. Mitigação: 48h de divergência 0 por org.
3. Merge tocando métricas históricas. Mitigação: nada é recalculado; snapshot em auditoria.
4. Endpoint novo sem Route → `unrouted_inbound`. Mitigação: alerta imediato + checklist de provisionamento.
5. Timeline consolidada antes da Fase 3 em contas com histórico grande. Mitigação: Fase 3 pode ser antecipada/paralelizada — não depende da Fase 2.
6. Regressão silenciosa no Atendimento. Mitigação: teste 15 como gate de aceite de cada fase.

---

## READY FOR IMPLEMENTATION: YES

Primeira entrega executável: **Fase 1**, com o resolver em shadow (nenhuma mudança de comportamento até o flip).

Pendências que não bloqueiam o início: aprovação da Política de Consolidação (necessária antes do merge, dentro da Fase 2) e decisão humana sobre as 13 threads ambíguas (necessária antes do `NOT NULL`, também na Fase 2).
