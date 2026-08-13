# Fechar Fase 2 — Etapa B, ensaio da trigger e outbound resolver V2 (flag OFF)

## Diagnóstico já confirmado nesta sessão (leitura de código)

**Inbound canônico:** implementado e deployado — `_shared/sales-canonical-gate.ts`
(3 condições) + `_shared/sales-thread.ts`, consumidos pelos três webhooks
(`meta-whatsapp-webhook`, `twilio-whatsapp-webhook`, `evolution-webhook`).

**Outbound / resolver V2: NÃO está pronto para produção.** Dois problemas
verificados no código atual:

1. `_shared/route-resolver.ts` existe apenas em **shadow** e **não é importado
   por nenhum dispatcher** (grep confirmou zero call sites fora do próprio teste).
   Além disso contém exatamente os fallbacks que o contrato proíbe:
   `resolved_by_thread_primary_endpoint` e `resolved_by_single_active_route`.
2. `_shared/dispatch-whatsapp-send.ts` (quem realmente decide o envio) resolve
   por `messaging_lines.key` derivado de `purpose`/`business_context`, e em
   seguida cai em cascata para `primary_endpoint_id` → último
   `messages.endpoint_id` → default `twilio`, mais uma re-rota fixa por org
   (`REROUTE_ORG_ID` → endpoint 7020). Nenhuma etapa usa
   `messaging_line_endpoints` a partir da **última inbound roteável**, e não
   existe o erro `REPLY_ROUTE_UNRESOLVED`.

**Trigger:** `trg_zz_guard_sales_thread_canonical` não está persistida em
produção; o SQL vive apenas no plano arquivado de 12/08.

## O que será feito

### 1. Etapa B — fechamento (read-only)
- Logs pós-deploy dos três providers; contagem de `canonical_gate`,
  `SALES_THREAD_*`, `audit_insert_error` e erros novos do gate.
- Query confirmando `conv_route_resolver_v2` OFF e 0 orgs.
- Query de duplicidades sales/whatsapp (esperado 0).
- Provider sem tráfego = `SEM_AMOSTRA` (coberto por T1–T10 + `deno check`).

### 2. Ensaio da trigger com ROLLBACK (nada persistido)
Um único bloco transacional: cria a trigger, roda os 5 casos
(insert duplicado → `SALES_THREAD_DUPLICATE_BLOCKED`; merge/unmerge SALES_V2;
`customer_service` permitido; `business_context` NULL fora de escopo;
Atendimento intacto) e faz `ROLLBACK`. A trigger **não** fica em produção.

### 3. Outbound resolver V2 — implementar (atrás da flag, OFF)
Novo caminho canônico de resposta, aplicado **somente** quando:
thread `business_context = 'sales'`, canal `whatsapp`, e a flag
`conv_route_resolver_v2` estiver ON para a organização.

Ordem, sem nenhum fallback:
1. última mensagem **inbound** da thread com `endpoint_id` não nulo;
2. `messaging_line_endpoints` (`is_active`) → `line_id`;
3. `messaging_lines` da org/canal com `inbox_key = 'sales'` e `is_active`;
4. envio por `messaging_lines.active_endpoint_id`;
5. valida o endpoint ativo (`is_active`, provider suportado);
6. qualquer etapa sem resultado → erro `REPLY_ROUTE_UNRESOLVED`.

Proibido nesse caminho: `primary_endpoint_id`, `purpose`, provider default,
"Route única ativa" e a re-rota fixa por org. Os fallbacks shadow
`resolved_by_thread_primary_endpoint` e `resolved_by_single_active_route` são
removidos do resolver. Com a flag OFF, `dispatchWhatsAppSend` mantém byte a byte
o comportamento atual (Atendimento nunca entra no caminho novo).

### 4. Testes finais com flag OFF
Bateria Deno + bateria SQL sintética em transação com ROLLBACK cobrindo:
- inbound Meta/Twilio/Evolution: mesmo contato por números diferentes → uma
  thread sales; `resolved`/`closed` → reopen; rotação de endpoint;
- outbound: resposta sempre pelo `active_endpoint_id` da Route; endpoint
  histórico inativo serve só para descobrir a Route; `REPLY_ROUTE_UNRESOLVED`
  sem inbound roteável;
- casos históricos: 2890/5098 (Viagi) → Route → envio pelo 8439;
  7020 (Central) → Route → envio pelo 7067;
- loser consolidado nunca recebe mensagem nova;
- Atendimento sem regressão.

### 5. Relatório final
Exatamente no formato pedido (ETAPA_B, TRIGGER_ROLLBACK_TEST,
INBOUND_CANONICAL_READY, OUTBOUND_RESOLVER_READY, META, TWILIO, EVOLUTION,
ATENDIMENTO_REGRESSION, DUPLICIDADES_SALES_WHATSAPP, FLAG, TRIGGER_PROD,
UNIQUE, BLOQUEADORES_RESTANTES). Parada imediata se aparecer bloqueador real.

## Fora de escopo
Fase 3, índice unique, trigger persistida em produção, habilitar qualquer
organização (inclusive Viagi), qualquer mudança em Atendimento.
