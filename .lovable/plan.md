# PLANO TÉCNICO DE IMPLEMENTAÇÃO — GMUD Conversas Multicanal

Base: Impact Assessment v2 (aprovado). Nada implementado nesta etapa: sem migration, sem código, sem backfill, sem merge.

---

## 1. Arquitetura alvo

**Identidade canônica da Thread:** `organization_id + contact_id + Inbox`. Inbox = `sales` | `customer_service`. Comercial e Atendimento permanecem separados (ADR-0009).

`channel` **não** faz parte da identidade. Verificação feita no banco: hoje existem 0 contatos com threads em mais de um canal dentro da mesma Inbox (19.190 threads; 1 webchat, 2 `internal`, resto WhatsApp), portanto nenhum requisito real obriga dividir a conversa por canal. `channel` permanece na tabela como campo de compatibilidade/exibição (badge de canal na timeline, junto ao endpoint), sem participar de lookup nem de unique key. Canal `internal` são notas, não conversa.

**Route:** identidade operacional dentro de uma Inbox (`Comercial Principal`, `Comercial Secundária`, `João`, `Maria`). Uma Inbox tem N Routes.

**Inbound ≠ Outbound:**
- Inbound: N endpoints por Route, via associação persistente `route_inbound_endpoints`. Um endpoint inbound ativo pertence a uma Route por vez.
- Outbound: exatamente um `active_endpoint_id` por Route.

**Fluxo inbound:** `webhook → endpoint recebido → route_inbound_endpoints → Route → Route.inbox → thread(org+contact+Inbox, qualquer status) → message.endpoint_id = endpoint real`. Sem Route válida ⇒ evento não roteado com erro explícito. Nunca fallback silencioso.

**Fluxo outbound:** `thread → última mensagem inbound roteável → messages.endpoint_id → route_inbound_endpoints → Route → Route.active_endpoint_id → provider → envio`. Backend é a única autoridade; frontend apenas exibe.

**Última mensagem inbound roteável** (definição normativa): `direction = 'inbound'` **e** `endpoint_id IS NOT NULL` **e** o endpoint possui associação válida (`is_active`) em `route_inbound_endpoints`. Ordenação por `sent_at DESC, id DESC`.

Não havendo nenhuma mensagem inbound roteável, o resolver retorna erro explícito **`REPLY_ROUTE_UNRESOLVED`** e o envio é recusado. Proibido, sem exceção: usar `primary_endpoint_id`, usar `purpose`, usar o último outbound, usar provider default, ou qualquer outro fallback silencioso. A UI mostra ação corretiva ("Esta conversa não tem número de origem roteável. Associe o endpoint a uma Route.").

**`primary_endpoint_id`:** sai da resolução de envio; permanece como endpoint de origem (histórico).
**`purpose`:** usado apenas como insumo de backfill/classificação histórica, nunca como fonte do runtime novo.

### 1.1 Ciclo de vida da Thread — decisão explícita

**Uma conversa por Contato + Inbox, para sempre — Thread única inclusive através de resolve/reopen.** Não é "uma aberta por vez".

Consequências normativas:
- Inbound procura a Thread por `org + contact + Inbox` **independentemente do status**.
- Thread `resolved`/`closed` é **reaberta** (`status → open`, `resolved_at → NULL`, evento de sistema `THREAD_REOPENED`), nunca duplicada.
- Criação de Thread só ocorre quando **nunca** existiu Thread para aquele `org + contact + Inbox`.
- A unique key da Fase 8 é **total**, não parcial por status: `UNIQUE (organization_id, contact_id, business_context)` — o que também elimina o acúmulo de threads históricas (hoje: 6.477 `customer_service` resolvidas e 1.302 `sales` resolvidas convivendo com abertas do mesmo contato).
- Multiplicidade de casos/tickets no Atendimento, **se** vier a ser um requisito, será uma entidade de caso separada apontando para a Thread única. A conversa não é duplicada para representar caso.

Impacto no faseamento: a Fase 7 passa a consolidar também os pares "aberta + resolvida" do mesmo `contact + Inbox`, não só os conflitos de abertas — o volume real de grupos a consolidar deve ser recontado no dry-run da Fase 7 (os ≈116 grupos medidos consideravam apenas threads abertas).


---

## 2. Schema conceitual (sem SQL)

**Novas**
- `messaging_routes` — org, `inbox` (`sales`/`customer_service`), `name`, `slug`, `channel`, `active_endpoint_id` (FK endpoint, nullable), `owner_user_id` (nullable, para "Route João"), `is_active`, `priority`, timestamps. Unicidade `(org, channel, slug)`; sem unicidade por inbox (N Routes por Inbox).
- `route_inbound_endpoints` — `route_id`, `endpoint_id`, `is_active`, `linked_at`, `unlinked_at`. Índice único parcial garantindo um endpoint ativo em no máximo uma Route por org+channel.
- `route_rotations` — auditoria de rotação (de/para/quem/quando/motivo).
- `thread_business_context_review` — fila das 13 threads ambíguas (Fase 2), descartável após o NOT NULL.

**Alteradas**
- `message_threads`: `business_context` → NOT NULL (Fase 8); nova unique **total** `(organization_id, contact_id, business_context)`, sem `channel` e sem filtro de status; uniques por endpoint removidas na mesma fase. `channel` mantido como campo de compatibilidade/exibição, fora de lookup e de unique key.
- `integration_inbound_events`: novo `process_status` para inbound sem Route.

**Não criar:** `conversation_blocks`, `timeline_groups`, `message_sections`. Blocos por endpoint são apenas renderização.

---

## 3. Feature flags

Em `feature_flags` (por org, via `fn_feature_flag_enabled` / `_shared/feature-flags.ts`, cache 60s, rollback ≤60s):

| Flag | Governa |
|---|---|
| `conv_route_resolver_v2` | Resolver server-side único (inbound+outbound) |
| `conv_inbound_v2_meta` | Meta inbound V2 |
| `conv_inbound_v2_twilio` | Twilio inbound V2 |
| `conv_inbound_v2_evolution` | Evolution inbound V2 |
| `conv_thread_identity_v2` | Nova identidade da thread |
| `conv_timeline_paginated` | Paginação/virtualização |
| `conv_timeline_endpoint_blocks` | Blocos por endpoint |
| `conv_composer_endpoint_display` | Composer exibindo endpoint efetivo |
| `conv_routes_admin_ui` | UI de administração de Routes |

---

## 4. Fases

### Fase 0 — Observabilidade, contratos e testes
- **Objetivo:** medir o comportamento atual antes de mudar qualquer coisa.
- **Arquivos:** novo módulo de log estruturado em `supabase/functions/_shared/`; `service-health`, `service-events`; testes Deno por webhook.
- **Migration:** não. **Flag:** nenhuma. **Backward:** total.
- **Escopo:** eventos `route_resolution_attempt` em shadow (endpoint, inbox inferida, route inferida, decisão), sem alterar comportamento; contador de threads que seriam reutilizadas sob a regra nova; golden tests de payload inbound por provider fixando o comportamento atual.
- **Aceite:** shadow log cobre ≥99% do inbound por 72h; divergência esperada quantificada.
- **Rollback:** remover logs.

### Fase 1 — Schema aditivo de Route e mapping inbound
- **Objetivo:** criar `messaging_routes`, `route_inbound_endpoints`, `route_rotations` sem consumidor em produção.
- **Migration:** sim (aditiva, com GRANTs e RLS por `organization_id = ANY(current_user_org_ids())`).
- **Rollout:** migration + seed derivado de `messaging_lines` e `communication_endpoints.purpose`, revisado manualmente (20 endpoints ativos).
- **Testes:** unicidade "um endpoint ativo → uma Route"; FK; RLS.
- **Aceite:** 100% dos endpoints ativos mapeados a exatamente uma Route; zero órfão.
- **Rollback:** drop das tabelas novas.

### Fase 2 — Backfill de `business_context`
- **Objetivo:** eliminar `business_context NULL`.
- **Escopo:** 146 threads determinísticas (via `purpose` do endpoint) + 13 ambíguas enfileiradas para decisão humana. NOT NULL não é aplicado nesta fase.
- **Migration:** sim (backfill em lote + tabela de revisão), com cron pausado; toca apenas `message_threads`.
- **Testes:** nenhuma thread muda de Inbox inesperadamente; os 568 pares "1 sales + 1 CS" permanecem intactos.
- **Aceite:** NULL = 13 (fila) e depois 0.
- **Rollback:** snapshot do valor anterior na tabela de revisão.

### Fase 3 — Resolver server-side único (`route-resolver`)
- **Objetivo:** um contrato único de resolução inbound/outbound.
- **Arquivos:** novo `supabase/functions/_shared/route-resolver.ts`; `_shared/dispatch-whatsapp-send.ts`; `src/lib/dispatchWhatsAppSend.ts` (passa a delegar); `meta-whatsapp-send`, `twilio-whatsapp-send`, `evolution-whatsapp-send`; `useThreadSendEndpoint` vira leitura do resolver.
- **Migration:** não. **Flag:** `conv_route_resolver_v2`.
- **Rollout:** shadow primeiro (resolver calcula e loga divergência vs. caminho atual), flip por org depois.
- **Aceite:** divergência 0 em shadow por 48h antes do flip.
- **Rollback:** flag off.
- **Removidos nesta fase:** `REROUTE_ORG_ID`, `REROUTE_TARGET_ENDPOINT_ID`, `salesContextMismatch` client-only, default Twilio, "último endpoint" como fallback técnico, `resolveComposerProvider`.

### Fases 4/5/6 — Inbound V2 por provider (Meta → Twilio → Evolution)
Uma fase por provider (Opção B aprovada).
- **Objetivo:** trocar o predicado de lookup da thread de `primary_endpoint_id` para `org + contact + business_context` derivado da Route, **sem filtro de status e sem filtro de canal**; `messages.endpoint_id` continua sendo o endpoint real recebido.
- **Arquivos:** `meta-whatsapp-webhook/index.ts` (F4), `twilio-whatsapp-webhook/index.ts` (F5), `evolution-webhook/index.ts` (F6).
- **Migration:** não. **Flag:** `conv_inbound_v2_<provider>`, por org, começando pela org piloto de menor volume.
- **Reopen:** thread encontrada em `resolved`/`closed` é reaberta (`status → open`, `resolved_at → NULL`, evento `THREAD_REOPENED`), nunca duplicada.
- **Mudanças específicas:** Meta — remover filtro por endpoint no lookup; `duplicate_thread_detected` passa a significar conflito real. Twilio — remover os dois fallbacks (thread legada com endpoint nulo e lookup sem filtro); manter backfill de `messages.endpoint_id` nos status callbacks. Evolution — remover o passo de migração de provider da thread; manter o evento de sistema de troca de número.
- **Testes:** golden tests da Fase 0 + matriz da seção 6; teste de paridade garantindo predicado de lookup idêntico nos três, incluindo o caminho de reopen.
- **Aceite:** zero thread nova para contato+Inbox já existente, **inclusive quando a existente está resolvida**; zero regressão nos golden tests.
- **Rollback:** flag off por provider.

### Fase 7 — Política + consolidação de Threads
- **Objetivo:** aprovar a Política de Consolidação (seção 5) e consolidar **todas** as threads duplicadas por `(org, contact, business_context)`, independentemente do status — não só as abertas. Os ≈116 grupos / ≈238 threads medidos consideravam apenas threads abertas; o número final (incluindo pares aberta+resolvida e múltiplas resolvidas) é apurado no dry-run desta fase.
- **Tabelas afetadas:** `message_threads`, `messages`, `message_thread_reads`, `thread_assignment_history`, `message_response_times`, `scheduled_messages`, `tasks`, `ai_agent_logs`, `ai_interaction_logs`, `message_thread_merge_audit`.
- **RPC:** nova `merge_threads_same_inbox_v1` (a `merge_message_threads` atual recusa endpoints diferentes; herda apenas a mecânica de movimentação e auditoria). Ignora `channel` como critério de bloqueio.
- **Migration:** sim (RPC nova + execução em lote).
- **Rollout:** dry-run com relatório por grupo → aprovação humana → execução em lotes com cron pausado. Ordem sugerida: primeiro os conflitos de abertas (53 contatos em `sales`), depois os grupos com resolvidas, que são maioria em volume.
- **Aceite:** zero grupo com mais de uma thread por `(org, contact, business_context)` em qualquer status; auditoria reversível.
- **Rollback:** `unmerge` equivalente, validado no dry-run antes do merge.

### Fase 8 — Nova unique key da Thread
- **Objetivo:** identidade nova garantida estruturalmente.
- **Migration:** sim — `business_context` NOT NULL; nova unique **total** `(organization_id, contact_id, business_context)`, **sem `channel` e sem filtro de status**; remoção das uniques por endpoint.
- **Pré-requisito:** `conv_thread_identity_v2` 100% ligada e Fase 7 concluída em todos os status (não só abertas) — sem isso o índice não é criável.
- **Aceite:** zero violação na criação do índice.
- **Rollback:** migration inversa restaurando as uniques antigas.

### Fase 9 — Paginação, virtualização e realtime compatível
- **Arquivos:** `src/pages/messages/MessagesList.tsx`, `src/components/inbox/InboxConversationTimeline.tsx`, `src/hooks/inbox/useInboxThreadMessages.ts`, `src/components/mobile/MobileMessagesList.tsx`, `MobileInbox.tsx`; novo hook comum `useThreadMessagesPaged`.
- **RPC:** nova RPC de mensagens por cursor (`sent_at, id`); índice de suporte se necessário.
- **Flag:** `conv_timeline_paginated`.
- **Escopo:** carregamento incremental (mais recentes primeiro), virtualização, memoização das linhas, realtime que insere sem invalidar a janela paginada, fim do `.limit(500)`.
- **Aceite:** thread de 545 msgs abre em <1s; scroll fluido; realtime não duplica nem perde mensagem.
- **Rollback:** flag off. Pode rodar em paralelo às Fases 4–6.

### Fase 10 — Timeline agrupada por Endpoint
- **Arquivos:** timelines desktop/mobile + `useEndpointNumbers`.
- **Regras:** hierarquia `Dia → Bloco de Endpoint → Mensagens consecutivas`; retorno a um endpoint anterior cria novo bloco (1111→2222→7777→1111 = 4 blocos). Mensagens sem `endpoint_id` não herdam endpoint, não quebram bloco e são exibidas sem badge. Notas internas sem endpoint por definição.
- **Flag:** `conv_timeline_endpoint_blocks`.
- **Aceite:** casos 1111→2222→7777→1111 e mensagens legadas renderizados conforme a regra.

### Fase 11 — Composer exibindo o endpoint efetivo
- **Objetivo:** "Respondendo por: WhatsApp João 7777", read-only.
- **Arquivos:** `MessagesList.tsx`, `InboxComposer.tsx`, `MobileMessagesList.tsx`, consumindo `useThreadSendEndpoint` já convertido na Fase 3 (hoje o InboxComposer não participa do mesmo caminho e escolhe template do provider errado).
- **Flag:** `conv_composer_endpoint_display`.
- **Aceite:** provider/capabilities/templates exibidos coincidem com o endpoint que o backend usará em 100% dos casos testados.

### Fase 12 — Administração de Routes e rotação
- **Arquivos:** novas telas em `src/pages/settings/`; Edge de rotação com auditoria.
- **Regras:** trocar `active_endpoint_id` não desassocia o endpoint antigo do inbound da Route (ele fica inbound-only) e não cria thread nem altera mensagens.
- **Flag:** `conv_routes_admin_ui`.
- **Aceite:** cenário de rotação da seção 6 reproduzível pela UI.

### Fase 13 — Remoção do legado
- **Escopo:** `messaging_lines` (após dual-read zerado), `primary_endpoint_id` → `origin_endpoint_id`, `purpose` marcado deprecated, `complianceGuards.ts` hardcoded (janela de 7 dias vencida), `migrateThreadAndSend.ts` (sem call sites), overloads duplicados de `rpc_list_message_threads`, flags já 100% ligadas.
- **Pré-requisito:** todas as fases anteriores estáveis por ≥2 semanas.
- **Aceite:** nenhuma referência viva ao caminho antigo.

---

## 5. Política de Consolidação de Threads (aprovar antes da Fase 7)

| Campo | Regra proposta | Risco |
|---|---|---|
| `primary_endpoint_id` | endpoint mais recente (campo deixa de rotear) | Baixo, reversível |
| `assigned_user_id` | da thread com atividade mais recente, com evento em `thread_assignment_history` | Médio, reversível |
| `original_owner_user_id` | o mais antigo entre as threads | Baixo |
| `opportunity_id` | a oportunidade aberta; duas abertas ⇒ revisão manual | Alto, reversível |
| `status` | o mais "aberto" entre as threads | Baixo |
| `priority` | máximo | Baixo |
| `first_response_at` | preservado por thread original, não reescrito | Alto se sobrescrito |
| `resolved_at` | NULL quando o resultado é aberto | Médio |
| SLA targets | histórico congelado; valem só para o futuro | Alto se recalculado |
| `last_routing_decision` | mais recente | Baixo |
| `category` | mais recente não-nula | Baixo |
| `needs_human_attention` | OR lógico | Baixo |

**Tabelas movidas no merge:** `messages` (com `merged_from_thread_id`), `message_thread_reads` (dedupe por usuário — pode marcar como lido algo não lido, decisão explícita), `thread_assignment_history` (append), `message_response_times` (não recalcular), `scheduled_messages` (repontar; revalidar endpoint no envio), `tasks`, `ai_agent_logs`/`ai_interaction_logs` (repontar; limite de mensagens por agente/thread revisto), `message_thread_merge_audit` (snapshot completo winner+loser).

---

## 6. Matriz de testes

| # | Cenário | Resultado esperado |
|---|---|---|
| 1 | 1 Inbox, 1 endpoint | 1 thread; envio pelo `active_endpoint` |
| 2 | 1 Inbox, N endpoints | 1 thread; N badges na timeline |
| 3 | Comercial Principal + Secundária | 1 thread comercial; resposta pela Route do último inbound |
| 4 | Número pessoal do vendedor (Route João) | 1 thread; resposta por 7777 |
| 5 | Meta + Twilio na mesma Inbox | 1 thread; provider correto por bloco |
| 6 | Meta + Evolution na mesma Inbox | 1 thread; free-form respeitando `requires_template_outside_window` |
| 7 | Endpoint rotacionado (1111→3333) | mesma Route, mesma thread, envio por 3333 |
| 8 | Cliente volta pelo número antigo (1111) | mesma thread; sem thread nova; mensagens antigas intactas |
| 9 | Cliente muda para outro número da mesma Inbox | mesma thread |
| 10 | Cliente fala Comercial e Atendimento | 2 threads, uma por Inbox |
| 11 | Fora da janela 24h, endpoint exige template | composer bloqueia free-form |
| 12 | `requires_template_outside_window = false` | free-form permitido |
| 13 | Endpoint offline | erro explícito, sem fallback |
| 14 | Route sem `active_endpoint_id` | envio recusado com erro claro |
| 15 | Endpoint inbound sem Route | evento não roteado + alerta; nada gravado no domínio |
| 16 | Realtime | mensagem nova aparece na thread única sem duplicar |
| 17 | Mobile | paridade com desktop nos itens 1–10 |
| 18 | IA | agente responde na thread única; limite por thread revisto |
| 19 | Scheduled message | endpoint resolvido no envio, não no agendamento |
| 20 | Webchat | thread da mesma Inbox do contato, sem thread nova por canal |
| 21 | Contato escreve, thread é resolvida, contato escreve de novo | mesma thread reaberta (`THREAD_REOPENED`); zero thread nova |
| 22 | Thread sem nenhuma mensagem inbound roteável | envio recusado com `REPLY_ROUTE_UNRESOLVED`; nenhum fallback |
| 23 | Última inbound com `endpoint_id` nulo, anterior roteável | resolve pela anterior roteável |
| 24 | Contato com histórico WhatsApp e novo contato por webchat na mesma Inbox | uma única thread; canal exibido por mensagem |

---

## 7. Métricas e SLA

O merge move o vínculo de `thread_id` mas não recalcula `message_response_times`, `first_response_at`, `resolved_at` nem rollups fechados (`seller_metrics_daily` incluído). Snapshot obrigatório no `merge_audit`. Relatórios anteriores à data do merge são lidos com a marcação de merge. Nenhuma métrica de negócio é reescrita silenciosamente.

---

## 8. Observabilidade transversal

Eventos estruturados: `route_resolution_attempt`, `route_resolution_divergence`, `unrouted_inbound`, `thread_reused`/`thread_created`, `merge_executed`, `send_blocked_no_route`. Expostos em `service-health` (taxa de não roteados como métrica de saúde) e `service-events`. Alerta imediato para qualquer `unrouted_inbound` — nesse modelo, evento não roteado é incidente.

---

## 9. Rollback

Flags (Fases 3, 4, 5, 6, 9, 10, 11, 12) → off imediato, sem migration. Fases 1 e 2 → migration inversa aditiva. Fase 7 → `unmerge` validado em dry-run antes do merge. Fase 8 → migration inversa restaurando uniques (ponto crítico). Fase 13 → executar só após estabilidade prolongada.

---

## 10. Riscos principais

1. Fase 8 sem a Fase 7 completa: criação do índice falha ou trava tabela quente.
2. Merge alterando métricas históricas — mitigado pela seção 7.
3. `conv_route_resolver_v2` ligado sem shadow — mitigado por 48h de divergência zero.
4. Endpoint inbound sem Route ao adicionar número novo — mitigado por alerta e checklist de provisionamento.
5. Divergência entre os três predicados de lookup nas Fases 4–6 — mitigado por teste de paridade.
6. Timeline consolidada antes da Fase 9 em contas com histórico grande — mitigado pela ordem das fases.
7. `message_thread_reads` no merge marcando como lido algo não lido — decisão explícita na política.

---

## READY FOR IMPLEMENTATION: YES

**Primeira fase segura para execução: Fase 0 — Observabilidade, contratos e testes.** Puramente aditiva, sem migration, sem flag e sem mudança de comportamento, e produz exatamente o dado que valida as fases seguintes.

Aprovações pendentes que não bloqueiam a Fase 0: Política de Consolidação (seção 5, necessária antes da Fase 7) e decisão humana sobre as 13 threads ambíguas (necessária antes da Fase 8).
