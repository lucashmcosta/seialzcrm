# PLANO TÉCNICO FINAL — GMUD Conversas Multicanal Comercial (4 fases)

**Objetivo único:** Comercial com múltiplos números WhatsApp (compartilhados e pessoais), múltiplos providers WhatsApp, **uma conversa por contato**, resposta sempre pelo número certo, troca de número auditável, UX estilo Kommo. Nada além disso.

**Atendimento fora do escopo funcional:** sem Routes de Atendimento, sem consolidação, sem mudança de SLA, fila, assignment, lifecycle ou identidade de thread. O resolver novo só intervém quando o endpoint/thread está no domínio Comercial V2; fora dele, caminho atual intocado.

**Uma flag:** `conv_route_resolver_v2` (shadow → flip por org). A UX da Fase 3 é render, com rollback por revert.

---

## Correções desta revisão

### 1. Sem `business_context NOT NULL` global — retirado

Forçar `NOT NULL` só serviria para limpar legado fora do Comercial V2. Sai do escopo. As 13 threads ambíguas permanecem legado, com `business_context` nulo, e **não bloqueiam a GMUD**: nenhuma delas entra no modelo `sales` e o índice parcial as ignora.

Constraint proposta (índice único parcial — não toca em nada fora de `sales`):

```
UNIQUE INDEX ON message_threads (organization_id, contact_id, channel)
WHERE business_context = 'sales'
```

Garante uma única Thread Comercial por contato sem exigir classificação de qualquer outra thread.

### 2. Rotação: reaproveitar `messaging_line_rotations` — nada de tabela nova

A tabela existente já entrega exatamente a garantia de domínio pedida: `organization_id`, `line_id`, `from_endpoint_id`, `to_endpoint_id`, `reason`, `rotated_by_user_id`, `rotated_at`. `route_rotations` está **removido do plano** — seria uma segunda trilha para o mesmo fato.

Consequência maior: **`messaging_lines` já é a Route** (`organization_id`, `key`, `name`, `channel`, `active_endpoint_id`). Portanto **não existe `messaging_routes` neste plano**. Route = `messaging_lines` evoluída, com uma trilha única de auditoria em `messaging_line_rotations`. Isso elimina uma tabela nova, uma migração de dados e a remoção do legado na Fase 4.

### 3. Ownership pessoal: vive na Route (`messaging_lines.owner_user_id`) — Opção B

`communication_endpoints.assigned_user_id` descreve quem opera **aquele número físico**. Não serve como ownership da Route: quando "Route João" troca de Evolution 7777 para Meta 8888, o ownership teria de ser reescrito em cada troca, e no intervalo a Route ficaria sem dono. A identidade "João" é estável; o endpoint é substituível.

Decisão: `messaging_lines.owner_user_id uuid NULL` (FK `users.id`) — nulo = Route compartilhada. `assigned_user_id` do endpoint permanece como é, sem duplicar semântica: é operação do número, não propriedade da linha. **`route.name`/`messaging_lines.name` nunca é fonte de ownership, autorização ou filtro** — é apresentação.

### 4. `channel` permanece na identidade — Opção B

- **Opção A** (`org + contact + business_context`) decidiria hoje que Webchat/Instagram entram na mesma Thread Comercial. Não há requisito aprovado para isso.
- **Opção B** (`org + contact + channel + business_context='sales'`) entrega o requisito inteiro — todos os números e providers WhatsApp unificados, porque todos são `channel='whatsapp'` — e não antecipa cross-channel.

Escolhida a **Opção B**. Nenhum teste ou afirmação do plano coloca webchat na mesma Thread Comercial, e a ausência atual de dados cross-channel não é usada como justificativa arquitetural.

---

## Modelo normativo

- **Thread Comercial** = `organization_id + contact_id + channel + business_context='sales'`, **independente de status**. Inbound em thread resolvida **reabre** (`THREAD_REOPENED`), nunca duplica.
- **Thread de Atendimento:** identidade e lifecycle inalterados.
- **Route** = `messaging_lines` (Comercial Principal, Comercial Secundária, WhatsApp João): N endpoints inbound, 1 `active_endpoint_id` para envio, `owner_user_id` opcional.
- **Outbound Comercial:** `thread → última mensagem inbound roteável → Route → Route.active_endpoint_id → provider`. *Inbound roteável* = `direction='inbound'` **e** `endpoint_id IS NOT NULL` **e** endpoint vinculado ativo a uma Route, ordem `sent_at DESC, id DESC`. Sem resolução ⇒ erro tipado **`REPLY_ROUTE_UNRESOLVED`**. Proibido fallback silencioso (`primary_endpoint_id`, `purpose`, último outbound, provider default).
- `primary_endpoint_id` passa a significar endpoint de origem; `purpose` só serve como insumo de backfill.

---

## Fase 1 — Infraestrutura (nada muda para o usuário)

- **Migration aditiva** (GRANTs + RLS `organization_id = ANY(current_user_org_ids())`):
  - `messaging_lines`: novas colunas `owner_user_id uuid NULL` (FK `users.id`) e `is_active boolean NOT NULL DEFAULT true`.
  - `messaging_line_endpoints` (única tabela nova): `line_id`, `endpoint_id`, `is_active`, `linked_at`, `unlinked_at`; índice único parcial garantindo um endpoint ativo em no máximo uma Route. É o mapa "número por onde o cliente escreveu → Route de resposta" — sem ele o resolver não tem entrada.
  - `messaging_line_rotations`: mantida como está; passa a ser preenchida pela troca via UI (Fase 3).
  - Vínculos inbound iniciais das linhas comerciais criados a partir de `active_endpoint_id` + `purpose`, revisados à mão (poucos endpoints ativos). **Nenhuma Route de Atendimento é criada.**
- **Resolver** `supabase/functions/_shared/route-resolver.ts`: contrato acima, consumido por `_shared/dispatch-whatsapp-send.ts` e pelos três `*-whatsapp-send`. Frontend (`src/lib/dispatchWhatsAppSend.ts`, `useThreadSendEndpoint`) passa a apenas **ler** o resultado.
- **Observabilidade mínima**, sobre `service-health`/`service-events` existentes: `route_resolution_divergence` (shadow), `unrouted_inbound` (alerta) e `reply_route_unresolved`. Sem tabela nova e sem novo `process_status`.
- **Rollout:** flag off = comportamento atual; resolver roda em shadow logando divergência.
- **Aceite:** todo endpoint comercial ativo vinculado a exatamente uma Route; divergência 0 por 48h antes de qualquer flip.
- **Rollback:** flag off + migration inversa (colunas e tabela novas, ninguém depende).

---

## Fase 2 — Migração Comercial (toda a lógica nova)

- **Inbound** (`meta-whatsapp-webhook`, `twilio-whatsapp-webhook`, `evolution-webhook`, mesma entrega, teste de paridade): quando o endpoint pertence a uma Route comercial, lookup por `org + contact + channel + 'sales'`, sem filtro de status, com reopen. Endpoint de Atendimento: caminho atual intocado. `messages.endpoint_id` segue sendo o endpoint real recebido. Remoções: filtro por endpoint no lookup (Meta), os dois fallbacks de thread legada (Twilio), o passo de migração de provider da thread (Evolution — o evento de sistema permanece).
- **Outbound:** flip da flag por org (piloto de menor volume primeiro); resolver passa a ser autoritativo.
- **Backfill de `business_context`:** apenas as threads determinísticas via `purpose` que entram no Comercial V2 (146 candidatas). As 13 ambíguas ficam como legado, sem classificação inventada.
- **Merge Comercial:** RPC `merge_threads_sales_v1` (a `merge_message_threads` atual recusa endpoints/contextos diferentes; herda só movimentação + auditoria). Escopo: duplicadas por `(org, contact, channel, 'sales')` em qualquer status (53 conflitos de abertas + grupos com resolvidas; volume final no dry-run). Repontar `messages` (`merged_from_thread_id`), `message_thread_reads`, `thread_assignment_history`, `scheduled_messages`, `tasks`, `ai_agent_logs`, `ai_interaction_logs`, com snapshot em `message_thread_merge_audit`. Métricas históricas e rollups **não** são recalculados.
- **Política de merge:** `primary_endpoint_id` = mais recente; `assigned_user_id` = da thread com atividade mais recente (evento em `thread_assignment_history`); `opportunity_id` = a aberta (duas abertas ⇒ revisão manual); `status` = o mais aberto; `priority` = máximo; `category` = mais recente não-nula; `needs_human_attention` = OR; `message_thread_reads` deduplicado por usuário.
- **Identidade final:** criar o índice único parcial `(organization_id, contact_id, channel) WHERE business_context = 'sales'` como último passo da fase; uniques por endpoint removidas. Garantias do Atendimento preservadas; nenhum `NOT NULL` global.
- **Aceite:** zero thread nova para contato comercial existente no mesmo canal (inclusive resolvida); zero grupo duplicado em `sales`; índice criado sem violação; Atendimento sem regressão (fila, SLA, reopen, assignment).
- **Rollback:** flag off; `unmerge` validado no dry-run antes do merge; migration inversa das uniques.

---

## Fase 3 — Nova experiência (UX Comercial)

- **Timeline paginada/virtualizada:** RPC por cursor (`sent_at, id`); fim do `.limit(500)`; realtime insere sem invalidar a janela. `src/pages/messages/MessagesList.tsx`, `src/components/mobile/MobileMessagesList.tsx`, hook novo `useThreadMessagesPaged`. **Somente Comercial** — Inbox de Atendimento fica como está.
- **Blocos por número (Kommo):** `Dia → Bloco de Endpoint → Mensagens consecutivas`; voltar a um endpoint anterior cria novo bloco. Mensagens sem `endpoint_id` não herdam endpoint, não quebram bloco e vão sem badge. Blocos são **render**, não tabela.
- **Composer:** "Respondendo por: WhatsApp João 7777", read-only, lendo o resolver; gate de janela/template pelo `requires_template_outside_window` do endpoint efetivo.
- **Administração de Routes:** tela em `src/pages/settings/` para criar/editar Route (nome, `owner_user_id`), vincular endpoints inbound e trocar `active_endpoint_id`, gravando **sempre** `messaging_line_rotations` (`from`, `to`, `rotated_by_user_id`, `reason` opcional). Trocar o número ativo não desvincula o antigo do inbound, não cria thread e não altera mensagens. Fim da rotação por SQL manual.
- **Aceite:** thread grande abre em <1s; provider/template exibidos = o que o backend usa; toda rotação rastreável na trilha única; paridade mobile.

---

## Fase 4 — Limpeza

- Remover `complianceGuards.ts` (janela vencida), `migrateThreadAndSend.ts` (sem call sites), overloads duplicados de `rpc_list_message_threads`, `endpoint-migration-note.ts`.
- `primary_endpoint_id` → `origin_endpoint_id`; `purpose` deprecated.
- Remover a flag e o caminho duplo.
- **`messaging_lines` e `messaging_line_rotations` permanecem** — são o modelo de Route e a trilha de auditoria, não legado.
- Atualizar `docs/modules/messages/` e registrar ADR de Route (sobre `messaging_lines`) + identidade da Thread Comercial.
- **Aceite:** nenhuma referência viva ao caminho antigo; métricas comerciais e SLA de atendimento estáveis vs. baseline.

---

## Matriz de testes (Fases 1–3, só Comercial WhatsApp)

| # | Cenário | Esperado |
|---|---|---|
| 1 | 1 número comercial | 1 thread; envio pelo `active_endpoint_id` |
| 2 | N números na mesma Inbox Comercial | 1 thread; N blocos/badges |
| 3 | Route Principal + Secundária | resposta pela Route do último inbound roteável |
| 4 | Route pessoal (João) troca de endpoint | Route segue do João via `owner_user_id`; envio pelo novo número |
| 5 | Meta + Twilio no Comercial | 1 thread; provider correto por bloco |
| 6 | Meta + Evolution no Comercial | free-form conforme `requires_template_outside_window` |
| 7 | Rotação 1111→3333 pela UI | mesma Route, mesma thread, envio por 3333, registro em `messaging_line_rotations` |
| 8 | Cliente volta pelo número antigo | mesma thread; mensagens antigas intactas |
| 9 | Thread comercial resolvida recebe inbound | mesma thread reaberta; zero thread nova |
| 10 | Contato fala Comercial e Atendimento | 2 threads, uma por Inbox |
| 11 | Sem inbound roteável | `REPLY_ROUTE_UNRESOLVED`; nenhum fallback |
| 12 | Última inbound com `endpoint_id` nulo | resolve pela anterior roteável |
| 13 | Endpoint inbound sem Route | `unrouted_inbound` + alerta; nada gravado no domínio |
| 14 | Route sem `active_endpoint_id` | envio recusado com erro claro |
| 15 | Atendimento (regressão) | fila, SLA, reopen e assignment idênticos ao baseline |
| 16 | Thread legada com `business_context` nulo | segue funcionando; ignorada pelo índice parcial |
| 17 | Mobile | paridade nos itens 1–10 |

---

## Justificativa das estruturas mantidas

- **`messaging_lines` evoluída (Route)** — único lugar que separa identidade de envio do endpoint físico; sem isso não há "responder pelo número certo" com número compartilhado + rotação.
- **`messaging_line_endpoints`** — mapa inbound→Route; entrada obrigatória do resolver.
- **`messaging_lines.owner_user_id`** — ownership de Route pessoal estável através de trocas de endpoint; não pode viver no nome nem no endpoint.
- **`messaging_line_rotations`** — trilha auditável de domínio da troca de número; já existe, reaproveitada.
- **Resolver** — requisito "backend autoritativo"; hoje a decisão está espalhada entre frontend e backend e divergem.
- **Merge** — requisito "uma conversa por contato" sobre dados já duplicados; sem ele o índice não cria.
- **Timeline + blocos + composer** — requisito "UX Kommo" e "histórico preservado".
- **Admin de Routes** — requisito "troca rápida de endpoint".
- **1 flag** — rollout seguro em multi-tenant.

## Removido nesta revisão

`messaging_routes` e `route_rotations` (duplicariam `messaging_lines`/`messaging_line_rotations`); `business_context NOT NULL` global; classificação forçada das 13 threads ambíguas; identidade de thread sem `channel` (decisão cross-channel prematura); Routes/consolidação/timeline v2 no Atendimento; `process_status` novo em `integration_inbound_events`; tabelas de blocos de timeline; recomputo de métricas históricas no merge; segunda feature flag.

## READY FOR PHASE 1: YES
