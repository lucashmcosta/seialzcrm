# Fronteiras de canal — Inbox × Messages

> **Decisão de negócio oficial:** Inbox e Messages são **módulos distintos com propósitos distintos** e permanecem separados. Não são duplicidade, não há plano de fusão, e propostas de "consolidação" devem ser recusadas por padrão. Ambos trabalham tecnicamente com mensagens (compartilham `message_threads` / `messages`), mas atendem áreas, públicos, fluxos e indicadores diferentes.

## Definição oficial

| | **Messages** (`/messages`) | **Inbox** (`/inbox`) |
|---|---|---|
| Área | Comercial / Vendas / Pré-venda | Atendimento / Customer Success / Pós-venda |
| Responsável | Equipe Comercial | Equipe de Atendimento |
| Público | Leads e oportunidades | Clientes ativos |
| Objetivo | Qualificação, follow-up, negociação, avanço de pipeline, conversão em cliente | Suporte, coleta de documentos, acompanhamento de processos, dúvidas, relacionamento pós-venda |
| SLAs | Próprios do comercial | Próprios do atendimento (config em `/settings/customer-service`) |
| Ownership | Dono comercial da conversa (round-robin comercial) | Fila/atribuição de atendimento |
| Indicadores | Conversão, avanço de etapa, tempo de resposta comercial | SLA de atendimento, resolução, `message_response_times` |

## Como a fronteira aparece no código e no banco

A separação **não é apenas de UI** — está materializada no modelo de dados e no roteamento de envio:

- **`message_threads.business_context`** — `'sales' | 'customer_service' | 'other'`. Classifica a conversa por propósito de negócio. Preenchido por trigger (`trg_message_threads_autofill_business_context`) e lido pelo composer (`src/hooks/useThreadBusinessContext.ts`).
- **`communication_endpoints.purpose`** — CHECK constraint com `commercial | customer_service | vendor_personal | other`. Cada número/canal remetente da org tem um propósito. Agrupamentos semânticos em `src/lib/endpointPurpose.ts`: `SALES_PURPOSES = ['commercial', 'vendor_personal']`, `CS_PURPOSES = ['customer_service', 'support', 'other']`. Mudanças de propósito são auditadas em `communication_endpoints_purpose_audit`.
- **`senderContext`** — todo envio via `dispatchWhatsAppSend` declara de qual superfície partiu (`'messages' | 'inbox'`), e as regras de re-rota valem **apenas** para `senderContext === 'messages'`, nunca em `/inbox`.

## Regras de roteamento

Fonte: `src/lib/dispatchWhatsAppSend.ts`, `src/hooks/useThreadSendEndpoint.ts`, `src/lib/resolveComposerProvider.ts` e as send functions `meta-whatsapp-send` / `twilio-whatsapp-send` / `evolution-whatsapp-send`.

Contrato de resolução (atualizado em 2026-07-22, ver [`plans/2026-07-endpoint-lines-rotation.md`](../plans/2026-07-endpoint-lines-rotation.md)):

`business_context` da thread → `purpose` correspondente (`sales`→`commercial`, `customer_service`→`customer_service`) → `messaging_lines.active_endpoint_id` da org para aquele `purpose` → `communication_endpoint` efetivo → capacidades (`requires_template_outside_window`, `is_active`, etc.).

1. **Linha ativa manda no envio.** O dispatcher escolhe o endpoint pela linha ativa do `purpose` correspondente ao `business_context` da thread — independente do provider do `primary_endpoint_id` histórico da thread. Trocar `active_endpoint_id` (ex.: Meta 2890 → Evolution 8439 na linha comercial da Viagi) faz toda a superfície comercial passar a enviar pelo novo número sem migrar threads e sem perder histórico.
2. **Thread é histórico, não roteador.** `message_threads.primary_endpoint_id` guarda a origem/primeiro número da conversa e serve para leitura visual do histórico (marcador "número trocado" na timeline). Não é mais consultado pelo dispatcher quando a linha ativa está resolvida.
3. **Send functions honram o endpoint explícito.** `meta-whatsapp-send`, `twilio-whatsapp-send` e `evolution-whatsapp-send` usam o `endpointId` recebido do dispatcher após validar `organization_id`, `provider` e `is_active`. Log `line_routing_honored` (info) quando o endpoint efetivo diverge do primary. Fallback ao `primary_endpoint_id` só acontece quando o payload não traz `endpointId`.
4. **Capacidade "digitar livre fora da janela 24h"** vem de `communication_endpoints.requires_template_outside_window` do endpoint efetivo — nunca deduzida do provider no frontend. Default `true`; `false` no provisionamento Evolution.
5. **UI de templates alinhada:** `resolveComposerProvider` segue o provider do endpoint efetivo resolvido pela linha ativa.
6. **Inbound:** webhooks resolvem a org via `waba_id` (Meta) / `messaging_service_sid` (Twilio) / `instance_name` (Evolution) → `communication_endpoints`; o propósito do endpoint que recebeu determina o `business_context` da thread (trigger `trg_message_threads_autofill_business_context`).

## Fluxo de vida de uma conversa

```
Lead entra (anúncio, CTWA, Lead Ads, inbound frio)
  → thread com business_context='sales', endpoint comercial
  → trabalhada pela equipe comercial em /messages
  → qualificação → oportunidade → negociação → ganho (won)
      → contato torna-se cliente ativo
      → relacionamento pós-venda passa a ser conduzido em /inbox
        (endpoint de atendimento, SLAs de atendimento, coleta de
        documentos via SuvSign, acompanhamento de processos)
```

Um mesmo contato pode ter conversas nos dois contextos ao longo do tempo; o que muda é o `business_context` da thread e o endpoint pelo qual a org fala com ele.

## Por que permanecem separados

1. **Áreas com donos diferentes** — comercial e atendimento têm equipes, metas e gestão distintas. Uma superfície única obrigaria permissões e filas híbridas.
2. **SLAs e indicadores incompatíveis** — tempo de resposta comercial (conversão) e SLA de atendimento (resolução) são medidos e cobrados de formas diferentes; misturá-los contaminaria os dois relatórios.
3. **Fluxos diferentes** — pré-venda gira em torno de pipeline/oportunidade; pós-venda gira em torno de processos, documentos e suporte.
4. **Números/canais diferentes** — a separação `commercial` × `customer_service` em `communication_endpoints` protege a saúde dos números WhatsApp (ver auditoria [`operations/audits/2026-07-whatsapp-7020.md`](../operations/audits/2026-07-whatsapp-7020.md): número comercial penalizado pela Meta por rajada de templates — um incidente que não deve contaminar o canal de atendimento).

## Riscos de uma futura unificação (por que não fazer)

- **Contaminação de métricas**: SLAs e relatórios de atendimento passariam a incluir conversas de venda (e vice-versa), invalidando os indicadores dos dois times.
- **Permissões**: vendedores veriam conversas de suporte de clientes e atendentes veriam negociações — quebra de escopo funcional que hoje é garantida pela separação de superfícies.
- **Saúde de número WhatsApp**: consolidar tráfego em menos endpoints concentra risco de bloqueio Meta (qualidade de número é avaliada por número).
- **Round-robin/ownership**: as regras de atribuição comercial (dono do lead) e de atendimento (fila) são conflitantes; unificar exigiria um modelo híbrido mais complexo do que manter dois.
- **Regressão do roteamento**: a re-rota lazy `sales → endpoint comercial` depende da distinção `senderContext`; sem ela, mensagens comerciais sairiam por número de atendimento novamente.

## Nota histórica

O Inbox v2 nasceu como evolução técnica da superfície de conversas (specs em [`plans/`](../plans/README.md) → `inbox-v2/`), e documentos antigos se referem a `/messages` como "legado" com "cutover" previsto. **A definição oficial acima prevalece**: o que é legado é o *caminho técnico de ingestão* (escrita direta em `messages` vs fila `integration_inbound_events`, ver [ADR-0004](../decisions/0004-inbound-events-queue.md)) — não o módulo Messages enquanto produto. As duas superfícies permanecem, cada uma servindo sua área.
