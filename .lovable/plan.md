# PLANO TÉCNICO — GMUD Conversas Multicanal (versão enxuta)

Revisão de redução de escopo. Nada foi adicionado; itens sem requisito real hoje foram removidos e estão listados em "Cortes".

**Objetivo único:** Comercial com múltiplos números (compartilhados e pessoais de vendedor), múltiplos providers, **uma conversa por contato**, resposta sempre pelo número certo, troca de número simples, UX estilo Kommo.

**Atendimento: não participa.** Continua com 1 Inbox, 1 endpoint, fila, SLA, assignment e lifecycle atuais. Não ganha Route, não ganha thread eterna, não é consolidado, não muda de identidade. Recebe apenas compatibilidade passiva: quando o endpoint da thread não pertence ao Comercial, o resolver devolve o endpoint atual da thread — exatamente o comportamento de hoje.

**Flag: uma só.** `conv_route_resolver_v2` (shadow → flip por org) cobre resolver + inbound. A UX da Fase 3 não recebe flag: é render, com rollback por revert.

---

## Modelo normativo (mínimo)

- **Thread Comercial** = `organization_id + contact_id + business_context='sales'`, **independente de status e de canal** (verificado: 0 contatos com threads em mais de um canal na mesma Inbox). Inbound em thread resolvida **reabre** (`THREAD_REOPENED`), nunca duplica.
- **Thread de Atendimento**: identidade e lifecycle inalterados.
- **Route** = identidade de envio dentro do Comercial (Comercial Principal, Comercial Secundária, WhatsApp João). N endpoints inbound por Route; 1 `active_endpoint_id` para envio.
- **Outbound Comercial:** `thread → última mensagem inbound roteável → Route → Route.active_endpoint_id → provider`. *Inbound roteável* = `direction='inbound'` **e** `endpoint_id IS NOT NULL` **e** endpoint vinculado ativo a uma Route, ordem `sent_at DESC, id DESC`. Sem resolução ⇒ erro tipado **`REPLY_ROUTE_UNRESOLVED`**. Proibido fallback silencioso (`primary_endpoint_id`, `purpose`, último outbound, provider default).
- `primary_endpoint_id` passa a significar endpoint de origem; `purpose` só serve como insumo de backfill.

---

## Fase 1 — Infraestrutura (nada muda para o usuário)

- **Migration aditiva** (GRANTs + RLS `organization_id = ANY(current_user_org_ids())`):
  - `messaging_routes`: `organization_id`, `name`, `slug`, `channel`, `active_endpoint_id`, `is_active`. Unique `(org, channel, slug)`. **Só Comercial** — nenhuma Route de Atendimento é criada.
  - `route_inbound_endpoints`: `route_id`, `endpoint_id`, `is_active`; índice único parcial: um endpoint ativo em no máximo uma Route.
  - Seed manual das Routes comerciais a partir de `messaging_lines` + `purpose` (poucos endpoints ativos — revisão à mão).
- **Resolver** `supabase/functions/_shared/route-resolver.ts`: contrato acima, consumido por `_shared/dispatch-whatsapp-send.ts` e pelos três `*-whatsapp-send`. Frontend (`src/lib/dispatchWhatsAppSend.ts`, `useThreadSendEndpoint`) passa a apenas **ler** o resultado.
- **Observabilidade mínima**: `route_resolution_divergence` (shadow), `unrouted_inbound` (alerta) e `reply_route_unresolved`. Sem dashboard novo — reaproveita `service-health`/`service-events`.
- **Rollout:** flag off = comportamento atual; resolver roda em shadow logando divergência.
- **Aceite:** todo endpoint comercial ativo em exatamente uma Route; divergência 0 por 48h antes de qualquer flip.
- **Rollback:** flag off + migration inversa (tabelas novas, ninguém depende).

---

## Fase 2 — Migração Comercial (toda a lógica nova)

- **Inbound** (`meta-whatsapp-webhook`, `twilio-whatsapp-webhook`, `evolution-webhook`, mesma entrega, teste de paridade): quando o endpoint pertence a uma Route comercial, lookup por `org + contact + 'sales'`, sem filtro de canal e sem filtro de status, com reopen. Endpoint de Atendimento: caminho atual intocado. `messages.endpoint_id` segue sendo o endpoint real. Remoções: filtro por endpoint no lookup (Meta), os dois fallbacks de thread legada (Twilio), o passo de migração de provider da thread (Evolution — o evento de sistema permanece).
- **Outbound:** flip da flag por org (piloto de menor volume primeiro); resolver passa a ser autoritativo.
- **Backfill de `business_context`:** 146 threads determinísticas via `purpose`; 13 ambíguas para decisão humana. Lotes pequenos, cron pausado (12 triggers em `messages`).
- **Merge Comercial:** RPC `merge_threads_sales_v1` (a `merge_message_threads` atual recusa endpoints/contextos diferentes; herda só movimentação + auditoria). Escopo: duplicadas por `(org, contact, 'sales')` em qualquer status (53 conflitos de abertas + grupos com resolvidas; volume final no dry-run). Repontar `messages` (`merged_from_thread_id`), `message_thread_reads`, `thread_assignment_history`, `scheduled_messages`, `tasks`, `ai_agent_logs`, `ai_interaction_logs`, com snapshot em `message_thread_merge_audit`. Métricas históricas e rollups **não** são recalculados.
- **Política de merge:** `primary_endpoint_id` = mais recente; `assigned_user_id` = da thread com atividade mais recente (com evento em `thread_assignment_history`); `opportunity_id` = a aberta (duas abertas ⇒ revisão manual); `status` = o mais aberto; `priority` = máximo; `category` = mais recente não-nula; `needs_human_attention` = OR; `message_thread_reads` deduplicado por usuário.
- **Identidade final:** `business_context` → NOT NULL; unique parcial `(organization_id, contact_id, business_context)` **restrita a `sales`**; uniques por endpoint removidas. Garantias do Atendimento preservadas.
- **Aceite:** zero thread nova para contato comercial existente (inclusive resolvida); zero grupo duplicado em `sales`; Atendimento sem regressão (fila, SLA, reopen, assignment).
- **Rollback:** flag off; `unmerge` validado no dry-run antes do merge; migration inversa das uniques.

---

## Fase 3 — Nova experiência (UX)

- **Timeline paginada/virtualizada:** RPC por cursor (`sent_at, id`); fim do `.limit(500)`; realtime insere sem invalidar a janela. `src/pages/messages/MessagesList.tsx`, `src/components/mobile/MobileMessagesList.tsx` e o hook novo `useThreadMessagesPaged`. **Somente Comercial** — Inbox de Atendimento fica como está.
- **Blocos por número (Kommo):** `Dia → Bloco de Endpoint → Mensagens consecutivas`; voltar a um endpoint anterior cria novo bloco. Mensagens sem `endpoint_id` não herdam endpoint, não quebram bloco e vão sem badge. Blocos são **render**, não tabela.
- **Composer:** "Respondendo por: WhatsApp João 7777", read-only, lendo o resolver; gate de janela/template pelo `requires_template_outside_window` do endpoint efetivo.
- **Administração de Routes:** tela em `src/pages/settings/` para criar Route, vincular endpoints inbound e trocar `active_endpoint_id`. Trocar o número ativo não desvincula o antigo do inbound, não cria thread e não altera mensagens. Fim da rotação por SQL manual.
- **Aceite:** thread grande abre em <1s; provider/template exibidos = o que o backend usa; rotação reproduzível pela UI; paridade mobile.

---

## Fase 4 — Limpeza

- Remover `messaging_lines` / `messaging_line_rotations` (sucedidos), `complianceGuards.ts` (janela vencida), `migrateThreadAndSend.ts` (sem call sites), overloads duplicados de `rpc_list_message_threads`, `endpoint-migration-note.ts`.
- `primary_endpoint_id` → `origin_endpoint_id`; `purpose` deprecated.
- Remover a flag e o caminho duplo.
- Atualizar `docs/modules/messages/` e registrar ADR de Route + identidade da Thread Comercial.
- **Aceite:** nenhuma referência viva ao caminho antigo; métricas comerciais e SLA de atendimento estáveis vs. baseline.

---

## Cortes desta revisão (e por quê)

| Item removido | Motivo |
|---|---|
| Routes no Atendimento | 1 Inbox + 1 endpoint hoje; nenhum requisito atual. Comercial funciona sem isso. |
| Thread eterna / reopen novo no Atendimento | Lifecycle atual funciona; mudar só cria risco de regressão de SLA. |
| Consolidação (merge) de threads de Atendimento | Não há duplicidade a resolver no escopo aprovado. |
| Timeline v2 na Inbox de Atendimento | Volume por thread é pequeno; problema de performance é do Comercial consolidado. |
| Tabela `route_rotations` | Troca de `active_endpoint_id` já é auditável pelos logs de integração/admin existentes; tabela nova não altera comportamento. |
| `owner_user_id` e `priority` em `messaging_routes` | Número pessoal do vendedor é resolvido pelo nome da Route; nenhuma regra de roteamento usa esses campos hoje. |
| Flag `conv_timeline_v2` | UX é render puro; rollback por revert. Uma flag basta. |
| `process_status` novo em `integration_inbound_events` | O evento `unrouted_inbound` + alerta já entregam o diagnóstico sem mudar contrato de tabela crítica. |
| Fila persistida de revisão das 13 threads ambíguas | 13 registros: decisão humana em query/planilha, sem estrutura nova. |
| Tabelas `conversation_blocks` / `timeline_groups` | Agrupamento é derivável em render. |
| Recalcular `message_response_times`, `first_response_at`, rollups no merge | Nenhum requisito pede recomputar histórico; recomputar é o maior risco do merge. |

## Justificativa das estruturas que ficaram

- **`messaging_routes`** — sem ela não existe "responder pelo número certo" com número compartilhado + rotação: é o único lugar que separa identidade de envio do endpoint físico. Remover quebra o Comercial.
- **`route_inbound_endpoints`** — é o mapa que liga o número por onde o cliente escreveu à Route de resposta. Sem isso o resolver não tem entrada.
- **Resolver** — requisito "backend autoritativo"; hoje a decisão está espalhada entre frontend e backend e divergem.
- **Merge** — requisito "uma conversa por contato" sobre dados já duplicados; sem ele a unique key não cria.
- **Timeline + blocos + composer** — requisito "UX Kommo" e "histórico preservado"; conversa consolidada é inusável sem paginação e sem identificação do número.
- **Admin de Routes** — requisito "troca rápida de endpoint"; hoje é SQL manual.
- **1 flag** — requisito de rollout seguro em produção multi-tenant.

## READY FOR IMPLEMENTATION: YES

Primeira entrega: **Fase 1** com resolver em shadow (zero mudança de comportamento). Pendências que não bloqueiam o início: aprovação da política de merge e decisão sobre as 13 threads ambíguas, ambas dentro da Fase 2.
