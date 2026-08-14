# "Responder por" — seleção automática pelo endpoint da última mensagem

## Auditoria read-only (estado atual)

**Como a "última mensagem" é determinada hoje**
- O resolver (`_shared/route-resolver.ts`, passo 3) busca apenas a última **inbound** com `endpoint_id`, ordenada por `created_at DESC`. Outbound nunca influencia.
- Com esse endpoint ele descobre a Route (`messaging_line_endpoints` ativo → `messaging_lines` sales/whatsapp ativa) e **envia por `messaging_lines.active_endpoint_id`**, não pelo endpoint da inbound.
- A UI ordena a timeline por `sent_at` (`MessagesList.tsx`).

**Todos os tipos têm `endpoint_id`?** Não. Em threads sales/whatsapp:
- outbound com endpoint: 74.903 · sem endpoint: 1.878
- inbound com endpoint: 73.587 · sem endpoint: 2.149
- `direction='internal'` (notas internas e eventos): 114 registros, parte com endpoint herdado

**Notas internas / sistema entram na ordenação?** Sim, se não filtradas: existem 80 registros com `is_internal_note=true` e 34 `direction='internal'` sem nota. Precisam ser ignorados: só `direction in ('inbound','outbound')`, `deleted_at is null`, `is_internal_note is not true`, `endpoint_id is not null`.

**Consumidores atuais das tabelas de preferência**
- `thread_reply_endpoint_prefs`: escrita/leitura via RPCs `set_thread_reply_endpoint_pref` / `clear_thread_reply_endpoint_pref`; lida por `useManualReplyEndpoint` e pelo validador server-side `_shared/manual-reply-endpoint.ts`. Nenhum outro consumidor.
- `user_reply_endpoints`: fonte da **lista de opções** na UI e passo de autorização no validador server-side (client mirror em `src/lib/manualReplyEndpoint.ts`).

**Consequência**: hoje o seletor mostra "Automático" + apenas endpoints com grant do usuário, e "Automático" cai em `active_endpoint_id`. Isso é exatamente o que o novo contrato remove.

## O que muda

### 1. Nova fonte de seleção (UI)
- Novo hook `useThreadLastEndpoint(threadId)`: busca a última mensagem válida da thread (`direction in ('inbound','outbound')`, `deleted_at is null`, `is_internal_note is not true`, `endpoint_id not null`, order `sent_at desc, created_at desc`, limit 1).
- `selectedEndpointId` passa a ser derivado assim:
  1. endpoint da última mensagem válida, **se ainda elegível** (mesma org, whatsapp, ativo, vinculado à Route Comercial, provider suportado);
  2. senão, se não existir nenhuma mensagem válida com endpoint → `messaging_lines.active_endpoint_id` da Route Comercial (fallback legado);
  3. se o endpoint da última mensagem existir mas estiver inelegível → nada é auto-selecionado; o seletor mostra estado "selecione um número" e o envio fica bloqueado até escolha explícita.
- Não há mais preferência persistida para explicar o estado visual: após um envio manual, a própria mensagem outbound vira a última mensagem e o seletor já reflete o novo número (invalidação da query no `onSuccess` do envio).

### 2. Lista de opções = endpoints Comerciais da organização
- Substituir a query em `user_reply_endpoints` por: endpoints `communication_endpoints` da org, `channel='whatsapp'`, `is_active=true`, com link ativo em `messaging_line_endpoints` para a `messaging_lines` sales/whatsapp ativa da org (mesma definição de `fn_is_sales_eligible_endpoint`).
- Resultado: nunca históricos/inativos, nunca Atendimento, nunca outra organização. Visível para qualquer usuário do módulo Comercial, sem grant.

### 3. Remoção de "Automático" e do conceito "Ativo"
- `ManualReplySelector.tsx`: remover item "Automático", `resetToAuto` e o rótulo `AUTO_LABEL`; lista só números reais com check no selecionado.
- `RouteIndicators.tsx` / `SalesRoutePanel.tsx` / `SalesWhatsAppSettingsSection.tsx`: remover badge "Ativo para envio" e ação "Tornar ativo" como conceito de resposta.
- `active_endpoint_id` permanece no backend apenas como fallback legado.

### 4. Envio sempre explícito
- O composer passa **sempre** o endpoint selecionado no payload (`manualReplyEndpointId`), inclusive quando ele coincide com o da última inbound. Some o caminho "auto" que caía em `active_endpoint_id`.
- `_shared/route-resolver.ts`: quando um endpoint explícito é informado e validado, ele é o `sendEndpointId` — o passo que hoje troca para `active_endpoint_id` deixa de valer para threads com contexto. Threads sem nenhuma mensagem com endpoint continuam usando `active_endpoint_id`.
- `_shared/manual-reply-endpoint.ts` (e o mirror em `src/lib/manualReplyEndpoint.ts`): o passo de autorização por `user_reply_endpoints` deixa de ser exigido; a validação passa a ser org + channel whatsapp + ativo + `fn_is_sales_eligible_endpoint` + provider suportado, mantendo fail-closed e os erros 409 já existentes.
- `thread_reply_endpoint_prefs` e `user_reply_endpoints` não são apagados nem alterados; apenas deixam de ser lidos no caminho de resposta.

## Testes (arquivo novo em `supabase/functions/_shared/`, helpers puros)
`LAST_MESSAGE_INBOUND_7020_EVOLUTION`, `LAST_MESSAGE_OUTBOUND_7067_META`, `LAST_MESSAGE_OUTBOUND_7020_EVOLUTION`, `NEW_INBOUND_AFTER_MANUAL_OVERRIDE`, `THREAD_WITHOUT_MESSAGES`, `LAST_MESSAGE_ENDPOINT_INACTIVE`, `CROSS_ORG_ENDPOINT`, `CUSTOMER_SERVICE_ENDPOINT`, `SWITCH_VISIBLE_FOR_COMMERCIAL_USER_WITHOUT_GRANTS`, mais o filtro de notas internas/`direction='internal'`.

## Escopo e limites
- Zero migração de dados, zero alteração de Routes, `active_endpoint_id`, `messaging_lines`, rotações, Atendimento.
- Nenhuma flag alterada nesta etapa. Observação: `sales_manual_reply_endpoint_v1` hoje está ON só para Viagi e Central — com a regra nova ela deixa de fazer sentido como gate de visibilidade; a liberação global fica como decisão separada, sua, depois da validação.
- Não mexe no diagnóstico da sessão Evolution 7020 (inbound Baileys) em andamento.

## Arquivos afetados
- `src/hooks/messages/useManualReplyEndpoint.ts` (reescrita da fonte de opções e da seleção)
- novo `src/hooks/messages/useThreadLastEndpoint.ts`
- `src/lib/manualReplySelection.ts` (helpers puros de última mensagem/elegibilidade)
- `src/components/messages/route/ManualReplySelector.tsx`, `RouteIndicators.tsx`, `SalesRoutePanel.tsx`
- `src/pages/messages/MessagesList.tsx` (payload sempre explícito + invalidação após envio)
- `supabase/functions/_shared/route-resolver.ts`, `supabase/functions/_shared/manual-reply-endpoint.ts`, `src/lib/manualReplyEndpoint.ts`
- deploy das functions de envio/dispatch afetadas
