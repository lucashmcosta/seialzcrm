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

### 1. Estado da UI: endpoint real + origem da seleção
- Novo hook `useThreadLastEndpoint(threadId)`: última mensagem válida da thread — `direction in ('inbound','outbound')`, `deleted_at is null`, `is_internal_note is not true`, `endpoint_id not null`, order `sent_at desc, created_at desc`, limit 1.
- Estado interno passa a ter `selectionSource: 'derived' | 'manual'`:
  - **derived** (padrão): ao abrir a conversa e a cada nova mensagem válida (realtime/invalidação), o seletor mostra o endpoint dessa última mensagem, se ainda elegível.
  - **manual**: só quando o operador troca explicitamente no dropdown. `selectedEndpointId` = escolha dele.
- Após um envio manual ser persistido, a query da última mensagem é invalidada e o estado volta a `derived` — a própria outbound recém-criada é agora a última mensagem, então o número exibido não muda.
- Thread sem nenhuma mensagem válida com endpoint → seleção inicial derivada do `active_endpoint_id` da Route Comercial (fallback legado), marcada internamente como `route_default`.
- Endpoint da última mensagem existente mas inelegível → nada é auto-selecionado; o composer bloqueia o envio e pede escolha explícita (nunca substitui em silêncio).
- A UI nunca exibe "Automático": sempre um número real ou o estado de "selecione um número".

### 2. Lista de opções = endpoints Comerciais da organização
- Substituir a query em `user_reply_endpoints` por: endpoints `communication_endpoints` da org, `channel='whatsapp'`, `is_active=true`, com link ativo em `messaging_line_endpoints` para a `messaging_lines` sales/whatsapp ativa da org (mesma definição de `fn_is_sales_eligible_endpoint`).
- Resultado: nunca históricos/inativos, nunca Atendimento, nunca outra organização. Visível para qualquer usuário do módulo Comercial, sem grant e sem preferência salva.

### 3. Remoção de "Automático" e do conceito "Ativo"
- `ManualReplySelector.tsx`: remover item "Automático", `resetToAuto` e `AUTO_LABEL`; lista só números reais com check no selecionado.
- `RouteIndicators.tsx` / `SalesRoutePanel.tsx` / `SalesWhatsAppSettingsSection.tsx`: remover badge "Ativo para envio" e a ação "Tornar ativo" como conceito de resposta; a lista passa a mostrar apenas `7067 | Meta | Conectado`, `7020 | Evolution | Conectado`.
- Essa limpeza de UI entra **depois** de o backend novo estar validado.

### 4. Novo contrato de payload (`replyEndpointSelection`)
Substitui o uso indiscriminado de `manualReplyEndpointId`:

```text
replyEndpointSelection: {
  source: "derived" | "manual",
  endpointId?: uuid   // obrigatório em manual; em derived é só hint visual
}
```

- `manualReplyEndpointId` continua aceito por compatibilidade e é interpretado como `{ source: "manual", endpointId }`; a UI passa a enviar o novo campo.
- Em `derived`, o `endpointId` enviado **não é usado para rotear** — serve apenas para log de divergência (detecta UI stale).

### 5. Precedência server-side (fonte de verdade no envio)
Em `_shared/route-resolver.ts` (dentro do escopo sales/whatsapp):
- **A) manual** → usa exatamente o endpoint escolhido; revalida org + channel whatsapp + `is_active` + `fn_is_sales_eligible_endpoint` + provider suportado; fail-closed (409) se falhar. Nunca cai em outro endpoint.
- **B) derived** → o backend **reconsulta a última mensagem válida no momento do envio** (mesmo filtro do hook) e envia exatamente por aquele `endpoint_id`, após a mesma revalidação. Se existe contexto e o endpoint está inelegível → fail-closed. Isso resolve a race condition de UI stale: inbound nova pelo 7020 chegando depois de a UI ter renderizado 7067 → envio sai pelo 7020.
- **C) route_default** → somente quando não existe nenhuma mensagem válida com `endpoint_id`: usa `messaging_lines.active_endpoint_id`.
- O passo atual que troca para `active_endpoint_id` mesmo havendo inbound roteável é removido.
- `_shared/manual-reply-endpoint.ts` e o mirror `src/lib/manualReplyEndpoint.ts`: o passo de autorização por `user_reply_endpoints` deixa de ser exigido; validação passa a ser org + whatsapp + ativo + elegibilidade Comercial + provider, mantendo os códigos de erro e os 409 já existentes.
- `thread_reply_endpoint_prefs` e `user_reply_endpoints` permanecem no schema, sem escrita nem leitura neste fluxo.

### 6. Auditoria da mensagem
`messages.metadata.reply_endpoint_choice` passa a assumir `"derived" | "manual" | "route_default"` (auto-select nunca é gravado como `manual`). `chosen_by_user_id` só é preenchido em `manual`. Mantém `resolved_endpoint_id` e, quando `derived` divergir do hint da UI, grava `ui_hint_endpoint_id` para rastrear staleness.

## Testes (helpers puros + testes em `supabase/functions/_shared/`)
`LAST_INBOUND_7020`, `LAST_OUTBOUND_7067`, `MANUAL_CHANGE_7020_TO_7067` (envio manual + próxima seleção derived=7067), `NEW_INBOUND_AFTER_MANUAL`, `RACE_CONDITION_UI_STALE` (hint 7067, banco 7020 → envia 7020), `LAST_ENDPOINT_INACTIVE` (fail-closed), `THREAD_WITHOUT_VALID_MESSAGE` (route default), `CROSS_ORG` (forbidden), `CUSTOMER_SERVICE_ENDPOINT` (forbidden), `COMMERCIAL_USER_WITHOUT_GRANTS` (switch visível), mais o filtro de internal/note/deleted na determinação da última mensagem.


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
