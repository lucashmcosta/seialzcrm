# Contrato — Números pessoais (`vendor_personal`) + preparação do Atendimento

Auditoria concluída (leitura de código, funções no banco e dados). Nada implementado.

## Estado atual verificado

- **Thread Comercial canônica**: identidade = `organization_id + contact_id + channel + business_context='sales'` (`_shared/sales-thread.ts:7-12`); `primary_endpoint_id` é só "último número usado". Endpoint pessoal cabe aqui sem thread nova.
- **Seleção de resposta**: `_shared/reply-endpoint-selection.ts` (derived = última mensagem válida, servidor reconsulta; manual = fail-closed) + `_shared/manual-reply-endpoint.ts` (validador único server-side) e o espelho cliente `src/lib/manualReplyEndpoint.ts`. **Hoje o passo de grants foi explicitamente removido** (comentário no passo 2: "Sem gate por grants") e há a regra "Proibido usar purpose/assignee/owner para inferir permissão" — ou seja, hoje **qualquer** usuário do Comercial pode responder por **qualquer** número elegível.
- **Opções da UI**: `useManualReplyEndpoint` lista todos os endpoints WhatsApp ativos da org aprovados por `fn_is_sales_eligible_endpoint` — sem filtro por usuário.
- **`vendor_personal` hoje**: reprovado por `isSalesEndpoint()` (só `sales|commercial`) e classificado como `business_context='other'` pelo trigger → thread em limbo. `assigned_user_id` existe e não é lido por nada de WhatsApp.
- **Atendimento**: `messaging_line_endpoints` tem **0 links** para linhas `customer_service` (6 ativos só em `sales`); `rotate_messaging_line_endpoint` recusa linha não-sales (`ROTATION_NOT_SALES_ROUTE`); `provision_sales_endpoint` recusa `inbox_key <> 'sales'`. Outbound de CS resolve por `messaging_lines.active_endpoint_id` (`_shared/dispatch-whatsapp-send.ts:225-251`), então a linha já funciona — falta só provisionar/rotacionar por UI.

## Contrato aprovado do número pessoal

1. Uma única thread Comercial por contato. Inbound pelo pessoal apenas rotaciona `primary_endpoint_id`.
2. Visibilidade inalterada: todo o time Comercial lê a conversa inteira. Sem ACL por mensagem, sem inbox pessoal, sem Route pessoal.
3. Autorização de **resposta** por endpoint:
   - endpoint `commercial` → permitido a qualquer usuário do Comercial (como hoje);
   - endpoint `vendor_personal` → permitido **exclusivamente** ao usuário em `communication_endpoints.assigned_user_id`. **Endpoint `vendor_personal` NÃO utiliza grants**: qualquer tentativa de criar grant em `user_reply_endpoints` para um endpoint pessoal é recusada, e `user_reply_endpoints` deixa de participar do modelo de números pessoais. A autorização vem exclusivamente de `assigned_user_id`.
4. Composer:
   - **Caso 1** último endpoint permitido → seleção derived automática, composer liberado;
   - **Caso 2** último endpoint é pessoal de outro → o contexto da última mensagem **permanece visível na thread** e o seletor continua mostrando `🔒 9999 · Pessoal · Junior` (contexto, não selecionável). Thread e histórico ficam exatamente iguais; apenas o composer é **bloqueado**, com placeholder "Escolha um número permitido para responder." O composer só libera após o usuário escolher explicitamente um endpoint permitido. Não esconder o endpoint, não limpar o contexto, nunca trocar de número automaticamente;
   - **Caso 3** nenhum endpoint permitido → composer bloqueado com "Você não possui nenhum número autorizado para responder esta conversa."
5. Backend é a autoridade: em `derived` ele reconsulta a última mensagem **e** revalida a permissão do usuário sobre aquele endpoint; se não permitido, recusa (nunca escolhe outro número).

## Respostas da auditoria

- CAN_KEEP_SINGLE_THREAD_FOR_PERSONAL=YES (identidade canônica não usa endpoint/purpose; só falta `isSalesEndpoint` + trigger aceitarem `vendor_personal`)
- CAN_BLOCK_COMPOSER_UNTIL_ENDPOINT_SELECTED=YES (o estado do composer já deriva de `useManualReplyEndpoint`; hoje falta o conceito "selecionado mas não permitido")
- SERVER_SIDE_VALIDATION_POINTS=`_shared/manual-reply-endpoint.ts` (novo passo de permissão pessoal), `_shared/reply-endpoint-selection.ts` (derived revalidado no envio), nova RPC `fn_can_user_use_reply_endpoint(_org,_user,_endpoint)` (SECURITY DEFINER, usada por UI e edge), `fn_guard_user_reply_endpoint` (recusa **qualquer** grant em endpoint `vendor_personal`), `fn_is_sales_eligible_endpoint` (elegibilidade Comercial, mantida), send functions Meta/Twilio/Evolution (defesa em profundidade já existente)
- CLIENT_SIDE_VALIDATION_POINTS=apenas apresentação: `useManualReplyEndpoint` (marca `allowedForUser`), `ManualReplySelector` (item 🔒 desabilitado), composer em `MessagesList.tsx` (disabled + placeholder), `src/lib/manualReplyEndpoint.ts` (só resolve provider). Nenhuma decisão exclusiva de frontend.
- PERSONAL_ENDPOINT_SELECTION_FLOW=derived → se permitido, envia; se pessoal de outro, exibe contexto bloqueado e exige escolha manual explícita entre os permitidos; manual sempre revalidado no servidor
- CUSTOMER_SERVICE_MULTI_ENDPOINT_SUPPORTED_TODAY=NO (0 links em `messaging_line_endpoints` para CS; provisionamento e rotação recusam linha não-sales)
- WHAT_IS_MISSING_FOR_CUSTOMER_SERVICE=RPC de provisionamento genérica por `inbox_key`, liberar rotação para `customer_service`, op na edge `sales-route-operations` (ou nova) e UI com destino + botão "tornar padrão". O outbound já resolve por `active_endpoint_id`, e o inbound já classifica por `purpose='customer_service'`.
- SCHEMA_CHANGES_REQUIRED=sem novas tabelas/colunas. Só funções: `fn_message_threads_autofill_business_context` (`vendor_personal → 'sales'`), nova `fn_can_user_use_reply_endpoint`, `fn_guard_user_reply_endpoint` (recusa grants em endpoint pessoal), nova `provision_line_endpoint(...)` aceitando `sales|customer_service` + `p_assigned_user_id`, `rotate_messaging_line_endpoint` liberando `customer_service`
- BACKEND_CHANGES_REQUIRED=`_shared/sales-thread.ts` (aceitar `vendor_personal` em `isSalesEndpoint`), `_shared/manual-reply-endpoint.ts` + `_shared/reply-endpoint-selection.ts` (novo passo de permissão, códigos `REPLY_ENDPOINT_PERSONAL_FORBIDDEN` / `REPLY_ENDPOINT_NONE_ALLOWED`), `sales-route-operations` (op de destino), gravação de `assigned_user_id` no provisionamento pessoal
- UI_CHANGES_REQUIRED=`useManualReplyEndpoint` (flag `allowedForUser` por opção + estado `blocked`), `ManualReplySelector` (🔒 Pessoal · Nome, item desabilitado), composer bloqueado com placeholder, passo "Destino" (Comercial/Atendimento/Pessoal + usuário) no Evolution e no Meta, botão "Tornar padrão" no Atendimento
- COMPATIBILITY_RISK=BAIXO-MÉDIO. Baixo: nada reclassifica endpoints existentes; hoje não há nenhum endpoint `vendor_personal` na base, então as regras novas nascem sem efeito retroativo; Atendimento continua com um número até alguém provisionar outro. Ponto de atenção real: incluir `vendor_personal` em `isSalesEndpoint` altera o gate canônico e o trigger de contexto — precisa ensaio em transação com ROLLBACK antes do commit, como nas fases anteriores.

## Plano técnico (fases, sem implementar agora)

**F1 — `vendor_personal` roteável (mesma thread canônica)**
1. Migração: trigger de `business_context` mapear `vendor_personal → 'sales'`.
2. `isSalesEndpoint()` aceitar `vendor_personal` (mantendo a exceção datada do endpoint 7020 legado).
3. Ensaio em transação com ROLLBACK: inbound simulado por endpoint pessoal cai na thread canônica existente do contato, sem criar thread nova, sem alterar `active_endpoint_id`, e a trigger `fn_guard_sales_thread_canonical` continua permitindo o update.
4. Validação: uma única thread por contato, regressão Comercial (7067/7020) inalterada.

**F2 — Permissão de resposta (composer + validação server-side)**
1. Migração: `fn_can_user_use_reply_endpoint(_organization_id, _user_id, _endpoint_id) returns boolean` — true se o endpoint é elegível ao Comercial **e** (`purpose <> 'vendor_personal'` **ou** `assigned_user_id = _user_id`). Sem cláusula de grant. Ajustar `fn_guard_user_reply_endpoint` para recusar **qualquer** grant cujo endpoint tenha `purpose = 'vendor_personal'`.
2. Backend: `manual-reply-endpoint.ts` chama a nova RPC (erro `REPLY_ENDPOINT_PERSONAL_FORBIDDEN`, 409); `reply-endpoint-selection.ts` aplica a mesma checagem no caminho `derived` e devolve `blocked` em vez de trocar de número.
3. UI: `allowedForUser` por opção; item 🔒 `Pessoal · <nome>` mantido visível como contexto (thread e histórico intactos); composer bloqueado nos casos 2 e 3 com os textos acordados; liberação só após escolha explícita.
4. Testes: casos 1/2/3 + cross-org + endpoint de Atendimento + tentativa de grant em endpoint pessoal (deve ser recusada sempre).

**F3 — Destino no provisionamento (Comercial / Atendimento / Pessoal)**
1. Migração: `provision_line_endpoint(p_organization_id, p_line_id, p_provider, p_address, p_purpose, p_display_name, p_instance_name, p_assigned_user_id)` — aceita `inbox_key IN ('sales','customer_service')`, recusa purpose incompatível com a linha, exige `p_assigned_user_id` (validado em `user_organizations` + usuário ativo) quando purpose é `vendor_personal` e grava esse dono no endpoint (a permissão vem daí, sem criar grant), **nunca** altera `active_endpoint_id`. `provision_sales_endpoint` permanece intacta.
2. `rotate_messaging_line_endpoint`: aceitar `inbox_key IN ('sales','customer_service')`, mantendo `ROTATION_ENDPOINT_IN_USE`, admin-only e log em `messaging_line_rotations`.
3. Edge: nova op `link_instance_to_destination` em `sales-route-operations` resolvendo a linha pelo destino.
4. UI: passo "Destino" no fluxo Evolution (Comercial / Atendimento / Pessoal + select de usuário obrigatório) e opção equivalente no Meta; na página WhatsApp Comercial/Atendimento, ação "Tornar padrão" (rotação explícita).

**F4 — Validação**
Smoke por destino: regressão Comercial (7067/7020 inalterados), pessoal (Caso 1/2/3 no composer, thread única), Atendimento (endpoint Evolution provisionado sem trocar o padrão, e promoção manual funcionando). Conferir que `purpose`, `is_active` e `active_endpoint_id` dos endpoints atuais das duas orgs não mudaram.

Fora de escopo: Route pessoal, thread pessoal, inbox pessoal, switch multi-número no Atendimento, qualquer backfill.

Nada será implementado antes da sua aprovação.
