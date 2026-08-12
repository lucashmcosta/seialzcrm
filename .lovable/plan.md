# PLANO TÉCNICO DE IMPLEMENTAÇÃO — GMUD Conversas Multicanal

Base: Impact Assessment v2 (aprovado). Nada implementado nesta etapa: sem migration, sem código, sem backfill, sem merge.

---

## 1. Arquitetura alvo

**Identidade da Thread:** `organization_id + contact_id + Inbox`. Inbox = `sales` | `customer_service`. Comercial e Atendimento permanecem separados (ADR-0009 preservado e reforçado).

**Route:** identidade operacional dentro de uma Inbox (`Comercial Principal`, `Comercial Secundária`, `João`, `Maria`). Uma Inbox tem N Routes.

**Inbound ≠ Outbound:**
- Inbound: N endpoints por Route, via associação persistente `route_inbound_endpoints`. Um endpoint inbound ativo pertence a **uma** Route por vez.
- Outbound: exatamente um `active_endpoint_id` por Route.

**Fluxo inbound:** `webhook → endpoint recebido → route_inbound_endpoints → Route → Route.inbox → thread(contact+Inbox) → message.endpoint_id = endpoint real`. Sem Route válida ⇒ evento **não roteado** com erro explícito. Nunca fallback silencioso.

**Fluxo outbound:** `thread → última mensagem inbound → messages.endpoint_id → route_inbound_endpoints → Route → Route.active_endpoint_id → provider → envio`. Backend é a única autoridade; frontend apenas exibe.

**`primary_endpoint_id`:** sai da resolução de envio; permanece como endpoint histórico/original. Depreciação planejada na Fase 13.
**`purpose`:** não é fonte autoritativa do runtime novo; usado apenas para backfill/classificação histórica; deprecated após a Fase 4–6, não removido na primeira fase.

---

## 2. Schema conceitual (sem SQL)

**Novas**
- `messaging_routes` — substitui conceitualmente `messaging_lines`. Campos: org, `inbox` (`sales`/`customer_service`), `name`, `slug`, `channel`, `active_endpoint_id` (FK endpoint, nullable), `owner_user_id` (nullable, para "Route João"), `is_active`, `priority`, timestamps. Unicidade: `(org, channel, slug)`; **não** unicidade por inbox (N Routes por Inbox).
- `route_inbound_endpoints` — `route_id`, `endpoint_id`, `is_active`, `linked_at`, `unlinked_at`. Índice único parcial garantindo **um endpoint ativo em no máximo uma Route** por org+channel.
- `route_rotations` — sucessora auditável de `messaging_line_rotations` (de/para/quem/quando/motivo).
- `thread_business_context_review` — fila temporária das 13 threads ambíguas (Fase 2), descartável após o NOT NULL.
- `unrouted_inbound_events` — registro de inbound sem Route (pode ser materializado como um `process_status` novo em `integration_inbound_events`; decisão na Fase 1).

**Alteradas**
- `message_threads`: `business_context` → NOT NULL (Fase 8); nova unique parcial por `(organization_id, contact_id, channel, business_context)` para status abertos; unique atual por endpoint removida na mesma fase.
- `messaging_lines`: mantida em dual-read até a Fase 13 (sem novos writes após a Fase 3).
- `communication_endpoints.purpose`: comentário de deprecação; sem mudança física.

**Não criar:** `conversation_blocks`, `timeline_groups`, `message_sections`. Blocos por endpoint são apenas renderização.

---

## 3. Feature flags

Todas em `feature_flags` (por org, lidas por `fn_feature_flag_enabled` / `_shared/feature-flags.ts`, cache 60s, rollback ≤60s):

| Flag | Governa |
|---|---|
| `conv_route_resolver_v2` | Resolver server-side único (inbound+outbound) |
| `conv_inbound_v2_meta` | Meta inbound V2 |
| `conv_inbound_v2_twilio` | Twilio inbound V2 |
| `conv_inbound_v2_evolution` | Evolution inbound V2 |
| `conv_thread_identity_v2` | Nova identidade da thread (lookup por Inbox) |
| `conv_timeline_paginated` | Paginação/virtualização |
| `conv_timeline_endpoint_blocks` | Blocos por endpoint |
| `conv_composer_endpoint_display` | Composer exibindo endpoint efetivo |
| `conv_routes_admin_ui` | UI de administração de Routes |

---

## 4. Fases

### Fase 0 — Observabilidade, contratos e testes
- **Objetivo:** medir o comportamento atual e travar contratos antes de mudar qualquer coisa.
- **Arquivos:** `supabase/functions/_shared/` (novo módulo de logging estruturado de roteamento); `service-health`, `service-events`; testes Deno por webhook.
- **Tabelas:** somente leitura + escrita em logs existentes.
- **RPC/Edge/Hooks/Componentes:** nenhum alterado.
- **Migration:** não.
- **Flag:** nenhuma.
- **Backward:** total.
- **Rollout:** deploy direto.
- **Observabilidade:** eventos `route_resolution_attempt` (endpoint, inbox inferida, route inferida, decisão) emitidos em **shadow**, sem alterar comportamento; contador de threads que *seriam* reutilizadas sob a regra nova.
- **Testes:** golden tests de payload inbound por provider (Meta/Twilio/Evolution/Webchat) fixando o comportamento atual.
- **Aceite:** shadow log cobre ≥99% do inbound por 72h; divergência esperada quantificada.
- **Rollback:** remover logs.
- **Dependências:** nenhuma. **Riscos:** baixo (volume de log).

### Fase 1 — Schema aditivo de Route e mapping inbound
- **Objetivo:** criar `messaging_routes`, `route_inbound_endpoints`, `route_rotations` sem nenhum consumidor em produção.
- **Tabelas:** as três novas (+ GRANTs + RLS por `organization_id = ANY(current_user_org_ids())`).
- **Migration:** sim (aditiva, sem SQL nesta etapa).
- **Flag:** nenhuma (tabelas ociosas).
- **Backward:** total.
- **Rollout:** migration + seed derivado de `messaging_lines` e `communication_endpoints.purpose` (uso legítimo de `purpose` como **backfill**, não runtime).
- **Observabilidade:** relatório de endpoints ativos sem Route.
- **Testes:** unicidade "um endpoint ativo → uma Route"; FK; RLS.
- **Aceite:** 100% dos 20 endpoints ativos mapeados a exatamente uma Route; zero endpoint órfão.
- **Rollback:** drop das tabelas novas.
- **Dependências:** Fase 0. **Riscos:** seed incorreto (mitigado por revisão manual, são 20 endpoints).

### Fase 2 — Backfill de `business_context`
- **Objetivo:** eliminar `business_context NULL` sem inventar regra.
- **Tabelas:** `message_threads`, `thread_business_context_review`.
- **Migration:** sim (backfill em lote + tabela de revisão). **Não** aplicar NOT NULL nesta fase.
- **Escopo:** 146 threads determinísticas (endpoint com `purpose` conhecido) + 13 ambíguas (sem endpoint) enfileiradas para decisão humana.
- **Backward:** total.
- **Rollout:** lotes pequenos com cron pausado (12 triggers em `messages`; ADR-0007). Backfill toca apenas `message_threads`, não `messages`.
- **Observabilidade:** contagem de NULL por dia até zero.
- **Testes:** nenhuma thread muda de Inbox de forma inesperada; 568 pares "1 sales + 1 CS" permanecem intactos.
- **Aceite:** `business_context NULL` = 13 (fila de revisão) e depois 0.
- **Rollback:** coluna de snapshot do valor anterior na tabela de revisão.
- **Dependências:** Fase 1. **Riscos:** baixo.

### Fase 3 — Resolver server-side único (`route-resolver`)
- **Objetivo:** um único contrato de resolução inbound/outbound, em `_shared/`.
- **Arquivos:** novo `supabase/functions/_shared/route-resolver.ts`; `_shared/dispatch-whatsapp-send.ts`; `src/lib/dispatchWhatsAppSend.ts` (passa a delegar, sem lógica própria).
- **Edge:** `meta-whatsapp-send`, `twilio-whatsapp-send`, `evolution-whatsapp-send` (validação passa a exigir Route).
- **Hooks:** `useThreadSendEndpoint` vira leitura do resolver (não recalcula regra).
- **Migration:** não.
- **Flag:** `conv_route_resolver_v2` (off → comportamento atual; on → resolver novo).
- **Backward:** dual-path por flag.
- **Rollout:** shadow primeiro (resolver calcula e loga divergência vs. caminho atual), depois flip por org.
- **Observabilidade:** `route_resolution_divergence` (esperado vs. atual), taxa de `no_route`.
- **Testes:** matriz da seção 6, itens de outbound.
- **Aceite:** divergência 0 em shadow por 48h antes do flip.
- **Rollback:** flag off.
- **Dependências:** Fases 1–2. **Riscos:** alto se ligado sem shadow; mitigado pela flag por org.
- **Nesta fase saem:** `REROUTE_ORG_ID`, `REROUTE_TARGET_ENDPOINT_ID`, `salesContextMismatch` client-only, default Twilio, "último endpoint" como fallback técnico, `resolveComposerProvider`.

### Fases 4/5/6 — Inbound V2 por provider (Meta → Twilio → Evolution)
Uma fase por provider, mesma estrutura (Opção B aprovada; sem refactor de ingest core).
- **Objetivo:** trocar o predicado de lookup da thread de `primary_endpoint_id` para `business_context` derivado da Route; `messages.endpoint_id` continua sendo o endpoint real recebido.
- **Arquivos:** `meta-whatsapp-webhook/index.ts` (F4), `twilio-whatsapp-webhook/index.ts` (F5), `evolution-webhook/index.ts` (F6).
- **Tabelas:** `message_threads` (lookup/insert), `messages`, `integration_inbound_events`.
- **Migration:** não.
- **Flag:** `conv_inbound_v2_<provider>`.
- **Backward:** caminho antigo intacto com a flag off.
- **Rollout:** flag por org, começando pela org piloto de menor volume.
- **Mudanças específicas:** Meta — remover filtro por endpoint no lookup; `duplicate_thread_detected` passa a significar conflito real. Twilio — remover os dois fallbacks (thread legada com endpoint nulo e lookup sem filtro); manter backfill de `messages.endpoint_id` nos status callbacks. Evolution — remover o passo de "migração de provider" (`THREAD_PROVIDER_MIGRATED`), que deixa de ser necessário; manter o evento de sistema como registro de troca de número.
- **Observabilidade:** threads criadas/reutilizadas por provider; eventos `unrouted_inbound`.
- **Testes:** golden tests da Fase 0 reexecutados + matriz da seção 6 por provider. Predicado de lookup textualmente idêntico nos três (teste de paridade).
- **Aceite:** zero thread nova criada para contato+Inbox já existente; zero regressão nos golden tests.
- **Rollback:** flag off por provider.
- **Dependências:** Fase 3. **Riscos:** médio; blast radius limitado a um provider por vez.

### Fase 7 — Política + consolidação de Threads
- **Objetivo:** aprovar a Política de Consolidação (seção 5) e só então consolidar os ≈116 grupos / ≈238 threads.
- **Tabelas:** `message_threads`, `messages`, `message_thread_reads`, `thread_assignment_history`, `message_response_times`, `scheduled_messages`, `tasks`, `ai_agent_logs`, `ai_interaction_logs`, `message_thread_merge_audit`.
- **RPC:** nova `merge_threads_same_inbox_v1` (a `merge_message_threads` atual **recusa** endpoints diferentes; não será reaproveitada como está — herda apenas a mecânica de movimentação e auditoria).
- **Migration:** sim (RPC nova + execução em lote controlado).
- **Flag:** não (operação pontual auditada).
- **Rollout:** dry-run com relatório por grupo → aprovação humana → execução em lotes com cron pausado.
- **Observabilidade:** auditoria completa por merge; diff de métricas antes/depois (seção 7).
- **Aceite:** zero grupo com >1 thread aberta por `(org, contact, inbox)`; auditoria reversível.
- **Rollback:** `unmerge` equivalente, validado no dry-run **antes** do merge.
- **Dependências:** Fases 2–6 e aprovação da política. **Riscos:** alto (dados históricos e métricas) — por isso é a fase mais tardia possível antes da unique key.

### Fase 8 — Nova unique key da Thread
- **Objetivo:** tornar a identidade nova estruturalmente garantida.
- **Migration:** sim — `business_context` NOT NULL; nova unique parcial por `(org, contact, channel, business_context)` em status abertos; remoção das duas uniques por endpoint.
- **Flag:** `conv_thread_identity_v2` já deve estar 100% ligada antes.
- **Backward:** ponto de não retorno lógico (revertível por migration inversa, mas com custo).
- **Aceite:** zero violação na criação do índice (garantida pela Fase 7).
- **Rollback:** migration inversa restaurando as uniques antigas.
- **Dependências:** Fase 7. **Riscos:** falha na criação do índice se a Fase 7 não zerar conflitos.

### Fase 9 — Paginação, virtualização e realtime compatível
- **Objetivo:** timeline suporta históricos consolidados.
- **Arquivos:** `src/pages/messages/MessagesList.tsx`, `src/components/inbox/InboxConversationTimeline.tsx`, `src/hooks/inbox/useInboxThreadMessages.ts`, `src/components/mobile/MobileMessagesList.tsx`, `MobileInbox.tsx`; novo hook comum `useThreadMessagesPaged`.
- **RPC:** nova RPC de mensagens por cursor (`sent_at, id`).
- **Migration:** possivelmente índice de suporte; sem mudança de modelo.
- **Flag:** `conv_timeline_paginated`.
- **Escopo:** carregamento incremental (mais recentes primeiro), virtualização, memoização das linhas, realtime que insere sem invalidar a janela paginada, remoção do `.limit(500)` como comportamento final.
- **Aceite:** thread de 545 msgs abre em <1s; scroll sem travar; realtime não duplica nem perde mensagem.
- **Rollback:** flag off.
- **Dependências:** independente das Fases 4–8 (pode ser antecipada se houver capacidade).

### Fase 10 — Timeline agrupada por Endpoint
- **Objetivo:** blocos visuais por endpoint dentro da thread única.
- **Arquivos:** timelines desktop/mobile + `useEndpointNumbers`.
- **Regras:** hierarquia `Dia → Bloco de Endpoint → Mensagens consecutivas`; retorno a um endpoint anterior cria **novo** bloco (1111→2222→7777→1111 = 4 blocos). Mensagens sem `endpoint_id` **não** herdam o endpoint anterior, **não** quebram bloco e são exibidas sem badge (ou com marca discreta de contexto legado). Notas internas sem endpoint por definição.
- **Flag:** `conv_timeline_endpoint_blocks`.
- **Aceite:** casos 1111→2222→7777→1111 e mensagens legadas renderizados conforme a regra.
- **Dependências:** Fase 9.

### Fase 11 — Composer exibindo o endpoint efetivo
- **Objetivo:** "Respondendo por: WhatsApp João 7777", read-only.
- **Arquivos:** `MessagesList.tsx`, `InboxComposer.tsx`, `MobileMessagesList.tsx`.
- **Hooks:** `useThreadSendEndpoint` (já convertido na Fase 3) exposto nas 3 superfícies — hoje o InboxComposer não participa do mesmo caminho, o que causa template do provider errado.
- **Flag:** `conv_composer_endpoint_display`.
- **Aceite:** provider/capabilities/templates exibidos coincidem com o endpoint que o backend usará em 100% dos casos testados. Override manual fica para fase posterior.
- **Dependências:** Fase 3.

### Fase 12 — Administração de Routes e rotação
- **Objetivo:** tirar a rotação do SQL manual.
- **Arquivos:** novas telas em `src/pages/settings/`; Edge para rotação com auditoria.
- **Regras:** trocar `active_endpoint_id` **não** desassocia o endpoint antigo do inbound da Route (ele passa a ser inbound-only) e **não** cria thread nem altera mensagens.
- **Flag:** `conv_routes_admin_ui`.
- **Aceite:** cenário de rotação da seção 6 reproduzível pela UI.
- **Dependências:** Fases 1 e 3.

### Fase 13 — Contract (remoção do legado)
- **Objetivo:** remover o que ficou em dual-path.
- **Escopo:** `messaging_lines` (após dual-read zerado), `primary_endpoint_id` renomeado para `origin_endpoint_id` (ou depreciado formalmente), `purpose` marcado deprecated, `complianceGuards.ts` hardcoded (janela de 7 dias vencida), `migrateThreadAndSend.ts` (sem call sites), overloads duplicados de `rpc_list_message_threads`, flags já 100% ligadas.
- **Aceite:** nenhuma referência viva ao caminho antigo.
- **Dependências:** todas as anteriores estáveis por ≥2 semanas.

**Reordenação sugerida:** a Fase 9 pode rodar em paralelo às Fases 4–6 (não têm dependência entre si) e reduz o risco de UX na Fase 7. A Fase 11 depende só da Fase 3.

---

## 5. Política de Consolidação de Threads (a aprovar antes da Fase 7)

Para cada campo, opções → impacto → recomendação → risco → reversibilidade.

| Campo | Opções | Recomendação | Risco / Reversibilidade |
|---|---|---|---|
| `primary_endpoint_id` | (a) do winner; (b) do endpoint mais recente; (c) NULL | (b) — coerente com "endpoint de origem mais recente"; campo deixa de rotear | Baixo / reversível (snapshot no audit) |
| `assigned_user_id` | (a) winner; (b) thread com atividade mais recente; (c) manter e sinalizar conflito | (b), com evento em `thread_assignment_history` — nunca silencioso | Médio (dono muda) / reversível |
| `original_owner_user_id` | (a) o mais antigo entre as threads | (a) — preserva atribuição comercial original | Baixo / reversível |
| `opportunity_id` | (a) winner; (b) oportunidade aberta; (c) mais recente; (d) conflito → revisão manual | (b), e (d) quando houver duas abertas | Alto (contamina pipeline) / reversível |
| `status` | (a) mais "aberto" entre as threads; (b) do winner | (a) — nunca fechar conversa viva | Baixo / reversível |
| `priority` | (a) máxima entre as threads | (a) | Baixo |
| `first_response_at` | (a) mínimo; (b) do winner; (c) preservar por thread original | **(c)** — ver seção 7; não reescrever métrica | Alto se (a) / irreversível se sobrescrito sem snapshot |
| `resolved_at` | (a) do winner; (b) NULL se o resultado é aberto | (b) | Médio |
| SLA targets | (a) recalcular; (b) congelar histórico e valer só para o futuro | (b) | Alto se (a) |
| `last_routing_decision` | (a) mais recente | (a) | Baixo |
| `category` | (a) winner; (b) mais recente não-nula | (b) | Baixo |
| `needs_human_attention` | (a) OR lógico | (a) | Baixo |

**Tabelas movidas no merge:** `messages` (com `merged_from_thread_id`), `message_thread_reads` (dedupe por usuário — atenção: pode marcar como lido algo não lido), `thread_assignment_history` (append), `message_response_times` (**não** recalcular), `scheduled_messages` (repontar; revalidar endpoint no envio), `tasks`, `ai_agent_logs`/`ai_interaction_logs` (repontar — o limite de mensagens por agente/thread muda de semântica e precisa ser revisto), `message_thread_merge_audit` (snapshot completo winner+loser).

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
| 8 | Cliente volta pelo número antigo (1111) | mesma thread; sem thread nova; sem alterar mensagens antigas |
| 9 | Cliente muda para outro número da mesma Inbox | mesma thread |
| 10 | Cliente fala Comercial **e** Atendimento | **2 threads**, uma por Inbox |
| 11 | Fora da janela 24h, endpoint exige template | composer bloqueia free-form |
| 12 | Endpoint com `requires_template_outside_window=false` | free-form permitido |
| 13 | Endpoint offline | erro explícito, sem fallback |
| 14 | Route sem `active_endpoint_id` | envio recusado com erro claro |
| 15 | Endpoint inbound sem Route | evento não roteado + alerta; nada gravado no domínio |
| 16 | Realtime | mensagem nova aparece na thread única sem duplicar |
| 17 | Mobile | paridade com desktop nos itens 1–10 |
| 18 | IA | agente responde na thread única; limite por thread revisto |
| 19 | Scheduled message | endpoint resolvido no momento do envio, não no agendamento |
| 20 | Webchat | thread própria por Inbox derivada da Route |

---

## 7. Métricas e SLA (avaliação explícita)

Consolidar threads históricas **altera** métricas se recalculado: `message_response_times` já materializado passaria a ter outra thread de referência; `first_response_at`/`resolved_at` do winner mudariam de significado; métricas por vendedor (`seller_metrics_daily`) e por Inbox seriam afetadas retroativamente.

**Regra do plano:** o merge **move** o vínculo de `thread_id` mas **não recalcula** `message_response_times`, `first_response_at`, `resolved_at` nem rollups já fechados. Snapshot obrigatório no `merge_audit`. Relatórios históricos anteriores à data do merge devem ser lidos com a marcação de merge. Nenhuma métrica de negócio é reescrita silenciosamente.

---

## 8. Observabilidade transversal

Eventos estruturados: `route_resolution_attempt`, `route_resolution_divergence`, `unrouted_inbound`, `thread_reused` / `thread_created`, `merge_executed`, `send_blocked_no_route`. Expostos em `service-health` (staleness e taxa de não roteados como métrica de saúde) e `service-events` (histórico). Alerta imediato para qualquer `unrouted_inbound` — nesse modelo, evento não roteado é incidente, não ruído.

---

## 9. Rollback

Por fase: flags (3, 4, 5, 6, 9, 10, 11, 12) → off imediato, sem migration. Fases 1 e 2 → migration inversa aditiva. Fase 7 → `unmerge` validado em dry-run antes do merge. Fase 8 → migration inversa restaurando uniques (com custo, é o ponto crítico). Fase 13 → não reversível por design; só executar após estabilidade prolongada.

---

## 10. Riscos principais

1. Fase 8 sem a Fase 7 completa: criação do índice falha ou trava tabela quente.
2. Merge alterando métricas históricas — mitigado pela seção 7.
3. `conv_route_resolver_v2` ligado sem shadow — mitigado por 48h de divergência zero.
4. Endpoint inbound sem Route após adicionar número novo — mitigado por alerta e checklist no provisionamento.
5. Divergência entre os três predicados de lookup nas Fases 4–6 — mitigado por teste de paridade.
6. Timeline consolidada antes da Fase 9 em contas com histórico grande (545 msgs hoje) — mitigado pela ordem das fases.
7. `message_thread_reads` no merge marcando como lido algo não lido — decisão explícita na política.

---

## 11. Itens classificados separadamente (fora do núcleo da GMUD)

- **Webchat `auto_create_opportunity`:** divergência de negócio real (webchat cria oportunidade sempre, ignorando a flag). Tratar como correção independente, fora da GMUD, para não aumentar o blast radius.
- **Gate BR inline do Meta** (não usa `resolveContactIngressIdentity`): dívida separada.
- **Backfill dos 4.764 `messages.endpoint_id`:** não é pré-requisito; 3.545 são indetermináveis; ~600 são determinísticos e podem ser feitos a qualquer momento.
- **Ingest core compartilhado:** dívida técnica pós-GMUD.

---

## READY FOR IMPLEMENTATION: YES

**Primeira fase segura para execução: Fase 0 — Observabilidade, contratos e testes.** É puramente aditiva, sem migration, sem flag e sem mudança de comportamento, e produz exatamente o dado que valida as fases seguintes (divergência esperada entre o roteamento atual e o alvo).

Duas aprovações continuam pendentes, mas **não bloqueiam a Fase 0**: a Política de Consolidação (seção 5, necessária antes da Fase 7) e a decisão humana sobre as 13 threads ambíguas (necessária antes da Fase 8).
