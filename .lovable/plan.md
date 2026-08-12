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

A tabela existente já entrega a garantia de domínio pedida: `organization_id`, `line_id`, `from_endpoint_id`, `to_endpoint_id`, `reason`, `rotated_by_user_id`, `rotated_at`. `route_rotations` está **removido do plano**. `line_id` continua apontando para `messaging_lines.id` — a Route —, então a trilha sobrevive integralmente ao novo modelo sem nenhuma alteração de schema.

Consequência: **`messaging_lines` é a Route**; não existe `messaging_routes` neste plano.

### 2b. Schema conceitual corrigido de `messaging_lines` (confrontado com o schema real)

Constraints reais hoje:

```
UNIQUE (organization_id, key, channel)
CHECK  (key IN ('commercial','customer_service','evolution_pilot'))
```

Dados reais: 5 linhas em 2 orgs (`commercial`, `customer_service`, `evolution_pilot`), todas `channel='whatsapp'`. Com isso, `key` significa hoje **Inbox e identidade da Route ao mesmo tempo** — incompatível com N Routes comerciais.

Evolução mínima (aditiva, sem renomear nem apagar `key`):

| Campo | Ação | Papel |
|---|---|---|
| `inbox_key text` | novo, criado **nullable e sem default**; `NOT NULL` + CHECK `IN ('sales','customer_service')` só após backfill validado | Inbox/contexto. Backfill explícito: `commercial`→`sales`, `evolution_pilot`→`sales`, `customer_service`→`customer_service` |
| `route_slug text` | novo, criado **nullable**; `NOT NULL` só após backfill validado | identidade individual estável da Route (`principal`, `secundaria`, `joao`, `maria`). Backfill: valor atual de `key` |
| `name text` | já existe | apresentação apenas — nunca ownership, autorização ou filtro |
| `owner_user_id uuid NULL` | novo, FK `users.id` | Route pessoal; nulo = compartilhada |
| `is_active boolean NOT NULL DEFAULT true` | novo | desativar Route sem apagar histórico |
| `key text` | **mantido, CHECK removido, passa a ser nullable** | compatibilidade legada: só a Route default de cada Inbox mantém `commercial`/`customer_service`; Routes novas nascem com `key = NULL` |
| `active_endpoint_id`, `channel`, `organization_id` | inalterados | envio, canal, tenant |

Constraints:

- `DROP CONSTRAINT messaging_lines_key_check` (bloqueia `route_slug` livre e novas linhas legadas).
- `DROP CONSTRAINT messaging_lines_organization_id_key_channel_key`, substituída por índice único **parcial** `(organization_id, key, channel) WHERE key IS NOT NULL` — preserva a garantia "uma linha default por Inbox/canal" que os consumers legados assumem.
- Nova constraint que impede duas Routes com a mesma identidade na org: `UNIQUE (organization_id, channel, route_slug)`.

### 2c. Consumers de `messaging_lines.key` (confrontados no código)

Todos leem exatamente o mesmo predicado `organization_id + key + channel` e esperam `commercial` ou `customer_service`, derivados do `purpose`/`business_context`:

- `src/hooks/useThreadSendEndpoint.ts` (composer)
- `src/lib/dispatchWhatsAppSend.ts` (dispatcher frontend)
- `supabase/functions/_shared/dispatch-whatsapp-send.ts`
- `supabase/functions/meta-whatsapp-send/index.ts`
- `supabase/functions/twilio-whatsapp-send/index.ts`
- `supabase/functions/evolution-whatsapp-send/index.ts`

**Impacto nos dispatchers:** zero na Fase 1. Como a Route default de cada Inbox conserva `key`, todas essas consultas continuam retornando exatamente uma linha. Na Fase 2, com a flag ligada, esses seis pontos passam a ler o resolver (que consulta Route por `messaging_line_endpoints`) e param de usar `key`; na Fase 4 `key` é removida.

**Impacto em `messaging_line_rotations`:** nenhum — referencia `line_id`, não `key`.

**`evolution_pilot`:** vira `inbox_key='sales'`, `route_slug='evolution_pilot'`, `key=NULL` (nenhum consumer consulta esse valor).

### 3. Ownership pessoal: vive na Route (`messaging_lines.owner_user_id`) — Opção B

`communication_endpoints.assigned_user_id` descreve quem opera **aquele número físico**. Não serve como ownership da Route: quando "Route João" troca de Evolution 7777 para Meta 8888, o ownership teria de ser reescrito em cada troca, e no intervalo a Route ficaria sem dono. A identidade "João" é estável; o endpoint é substituível.

Decisão: `messaging_lines.owner_user_id uuid NULL` (FK `users.id`) — nulo = Route compartilhada. `assigned_user_id` do endpoint permanece como é. **`name` nunca é fonte de ownership, autorização ou filtro.**


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

**Escopo fechado da Fase 1:** evolução segura de `messaging_lines`; `messaging_line_endpoints` **apenas para Comercial**; `owner_user_id`/`is_active`/`inbox_key`/`route_slug`; constraints novas; vínculos comerciais iniciais; RPC `rotate_messaging_line_endpoint` transacional; invariante `active_endpoint_id ↔ messaging_line_endpoints`; `route-resolver`; shadow mode; observabilidade mínima; testes desta fase. Nada além disso. `conv_route_resolver_v2` permanece **OFF**; nenhum webhook, merge, unique de `message_threads` ou timeline muda nesta fase.

**Atendimento — terminologia e limite:** o Atendimento **não adota Route V2**, nem funcional nem conceitualmente. A linha `customer_service` em `messaging_lines` permanece **somente por compatibilidade do sistema atual** — ela não é uma Route. Na Fase 1: nenhuma Route de Atendimento criada, nenhum `messaging_line_endpoints` para Atendimento, Atendimento não passa pelo resolver V2, nenhum comportamento de Atendimento alterado.

- **Migration aditiva em etapas seguras** (GRANTs + RLS `organization_id = ANY(current_user_org_ids())`). Ordem obrigatória, sem default implícito que possa classificar `customer_service` como `sales` nem por um instante:
  1. `ADD COLUMN inbox_key text` — **nullable, sem default**; `ADD COLUMN route_slug text` — **nullable**; `ADD COLUMN owner_user_id uuid NULL` FK `users.id`; `ADD COLUMN is_active boolean NOT NULL DEFAULT true`.
  2. Backfill explícito de `inbox_key`, linha por valor de `key`: `commercial`→`sales`, `evolution_pilot`→`sales`, `customer_service`→`customer_service`.
  3. Backfill de `route_slug` = valor atual de `key`.
  4. **Validação bloqueante:** falhar a migration se existir qualquer linha com `inbox_key IS NULL`, `route_slug IS NULL`, `inbox_key` fora de (`sales`,`customer_service`) ou `key` fora do conjunto conhecido (linha nova/inesperada ⇒ aborta em vez de classificar por default).
  5. Só então `ALTER COLUMN inbox_key SET NOT NULL`, `ALTER COLUMN route_slug SET NOT NULL` e `ADD CHECK (inbox_key IN ('sales','customer_service'))`.
  6. `key` mantida, nullable e sem CHECK, só para compatibilidade dos consumers legados.
  - Constraints: dropar `messaging_lines_key_check` e `messaging_lines_organization_id_key_channel_key`; criar índice único parcial `(organization_id, key, channel) WHERE key IS NOT NULL` e `UNIQUE (organization_id, channel, route_slug)`. Só depois disso o banco suporta N Routes comerciais na mesma org + canal.
  - `messaging_line_endpoints` (única tabela nova): `line_id`, `endpoint_id`, `is_active`, `linked_at`, `unlinked_at`; índice único parcial garantindo um endpoint ativo em no máximo uma Route. É o mapa "número por onde o cliente escreveu → Route de resposta" — sem ele o resolver não tem entrada. **Populada apenas com endpoints comerciais.**
  - `messaging_line_rotations`: inalterada (`line_id` já aponta para a Route); passa a ser gravada pela troca via UI (Fase 3).
  - Vínculos inbound iniciais das Routes comerciais criados a partir de `active_endpoint_id` + `purpose`, revisados à mão (poucos endpoints ativos). **Nenhuma Route de Atendimento é criada** — a linha `customer_service` existente permanece exatamente como está.

- **Rotação atômica (server-side, entra na Fase 1):** RPC `rotate_messaging_line_endpoint(p_line_id, p_endpoint_id, p_reason)` — `SECURITY DEFINER`, `search_path = public`, uma única transação. Passos na mesma execução: (1) Route pertence a `current_user_org_ids()`; (2) endpoint da **mesma** org; (3) `channel` compatível com a Route; (4) endpoint `is_active` e apto; (5) endpoint não vinculado ativamente a outra Route; (6) garantir vínculo ativo em `messaging_line_endpoints` (`line_id`, `endpoint_id`); (7) `UPDATE messaging_lines.active_endpoint_id`; (8) endpoint anterior **permanece** vinculado para inbound (desvinculação só por ação administrativa explícita e separada); (9) `INSERT` obrigatório em `messaging_line_rotations` (`line_id`, `from_endpoint_id`, `to_endpoint_id`, `rotated_by_user_id = current_user_id()`, `reason`, `rotated_at`); (10) commit único. Qualquer falha ⇒ **rollback completo**, com erro tipado (`ROTATION_ENDPOINT_FOREIGN_ORG`, `ROTATION_CHANNEL_MISMATCH`, `ROTATION_ENDPOINT_INACTIVE`, `ROTATION_ENDPOINT_IN_USE`).
- **Invariante do Comercial V2:** todo `messaging_lines.active_endpoint_id` não nulo tem associação **ativa** em `messaging_line_endpoints` para a mesma line (`active_endpoint_id ⊆ endpoints inbound da Route`). Garantido por trigger de validação em `messaging_lines` (BEFORE INS/UPD) — não por CHECK constraint —, no mesmo estilo de `fn_validate_thread_endpoint_org`.
- **Sem UPDATE direto pelo frontend:** `GRANT UPDATE` de `messaging_lines.active_endpoint_id` não é concedido a `authenticated`; a única porta é a RPC. Nenhum código de UI escreve em `messaging_lines`.
- **Testes da rotação (Fase 1):** (A) 1111→3333 bem-sucedida; (B) endpoint de outra org recusado; (C) endpoint já ativo em outra Route recusado; (D) falha ao gravar auditoria ⇒ rollback total (nada muda em `messaging_lines` nem no vínculo); (E) pós-rotação: inbound por 1111 e por 3333 resolvem a **mesma** Route e o outbound sai por 3333; (F) nenhuma thread ou mensagem histórica alterada (contagem e `endpoint_id` das mensagens idênticos antes/depois).
- **Resolver** `supabase/functions/_shared/route-resolver.ts`: contrato acima, consumido por `_shared/dispatch-whatsapp-send.ts` e pelos três `*-whatsapp-send`. Frontend (`src/lib/dispatchWhatsAppSend.ts`, `useThreadSendEndpoint`) passa a apenas **ler** o resultado.
- **Observabilidade mínima**, sobre `service-health`/`service-events` existentes: `route_resolution_divergence` (shadow), `unrouted_inbound` (alerta) e `reply_route_unresolved`. Sem tabela nova e sem novo `process_status`.
- **Rollout:** flag off = comportamento atual; resolver roda em shadow logando divergência.
- **Aceite:** todo endpoint comercial ativo vinculado a exatamente uma Route; invariante `active_endpoint_id ⊆ vínculos ativos` verdadeira para 100% das Routes; testes A–F verdes; divergência 0 por 48h antes de qualquer flip.
- **Rollback:** flag off + migration inversa (colunas, tabela, RPC e trigger novos, ninguém depende).


---

## Fase 2 — Migração Comercial (toda a lógica nova)

- **Inbound** (`meta-whatsapp-webhook`, `twilio-whatsapp-webhook`, `evolution-webhook`, mesma entrega, teste de paridade): quando o endpoint pertence a uma Route comercial, lookup por `org + contact + channel + 'sales'`, sem filtro de status, com reopen. Endpoint de Atendimento: caminho atual intocado. `messages.endpoint_id` segue sendo o endpoint real recebido. Remoções: filtro por endpoint no lookup (Meta), os dois fallbacks de thread legada (Twilio), o passo de migração de provider da thread (Evolution — o evento de sistema permanece).
- **Outbound:** flip da flag por org (piloto de menor volume primeiro); resolver passa a ser autoritativo.
- **Backfill de `business_context`:** apenas as threads determinísticas via `purpose` que entram no Comercial V2 (146 candidatas). As 13 ambíguas ficam como legado, sem classificação inventada.
- **Merge Comercial:** RPC `merge_threads_sales_v1` (a `merge_message_threads` atual recusa endpoints/contextos diferentes; herda só movimentação + auditoria). Escopo: duplicadas por `(org, contact, channel, 'sales')` em qualquer status (53 conflitos de abertas + grupos com resolvidas; volume final no dry-run). Repontar `messages` (`merged_from_thread_id`), `message_thread_reads`, `thread_assignment_history`, `scheduled_messages`, `tasks`, `ai_agent_logs`, `ai_interaction_logs`, com snapshot em `message_thread_merge_audit`. Métricas históricas e rollups **não** são recalculados.
- **Política de merge (corrigida):** `primary_endpoint_id` = o da thread **mais antiga** do grupo (menor `created_at`; empate ⇒ menor `sent_at` da primeira mensagem), coerente com a semântica de **endpoint de origem** — nunca o mais recente. Quando a thread mais antiga tem `primary_endpoint_id` nulo, preserva-se o valor do winner escolhido pelo critério de antiguidade e a limitação é registrada em `message_thread_merge_audit` (legado sem origem confiável); não se inventa origem. `primary_endpoint_id` **nunca** resolve outbound; as transições reais de número continuam visíveis em `messages.endpoint_id`. Demais campos: `assigned_user_id` = da thread com atividade mais recente (evento em `thread_assignment_history`); `opportunity_id` = a aberta (duas abertas ⇒ revisão manual); `status` = o mais aberto; `priority` = máximo; `category` = mais recente não-nula; `needs_human_attention` = OR; `message_thread_reads` deduplicado por usuário.
- **Identidade final:** criar o índice único parcial `(organization_id, contact_id, channel) WHERE business_context = 'sales'` como último passo da fase; uniques por endpoint removidas. Garantias do Atendimento preservadas; nenhum `NOT NULL` global.
- **Aceite:** zero thread nova para contato comercial existente no mesmo canal (inclusive resolvida); zero grupo duplicado em `sales`; índice criado sem violação; Atendimento sem regressão (fila, SLA, reopen, assignment).
- **Rollback:** flag off; `unmerge` validado no dry-run antes do merge; migration inversa das uniques.

---

## Fase 3 — Nova experiência (UX Comercial)

- **Timeline paginada/virtualizada:** RPC por cursor (`sent_at, id`); fim do `.limit(500)`; realtime insere sem invalidar a janela. `src/pages/messages/MessagesList.tsx`, `src/components/mobile/MobileMessagesList.tsx`, hook novo `useThreadMessagesPaged`. **Somente Comercial** — Inbox de Atendimento fica como está.
- **Blocos por número (Kommo):** `Dia → Bloco de Endpoint → Mensagens consecutivas`; voltar a um endpoint anterior cria novo bloco. Mensagens sem `endpoint_id` não herdam endpoint, não quebram bloco e vão sem badge. Blocos são **render**, não tabela.
- **Composer:** "Respondendo por: WhatsApp João 7777", read-only, lendo o resolver; gate de janela/template pelo `requires_template_outside_window` do endpoint efetivo.
- **Administração de Routes:** tela em `src/pages/settings/` para criar/editar Route (nome, `owner_user_id`), vincular endpoints inbound e trocar o número ativo **exclusivamente** pela RPC `rotate_messaging_line_endpoint` da Fase 1 (com campo opcional de motivo). Nenhum `UPDATE` direto em `messaging_lines` pelo frontend. A troca não desvincula o endpoint antigo do inbound, não cria thread e não altera mensagens; erros tipados da RPC são exibidos como mensagem clara. Fim da rotação por SQL manual.
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
