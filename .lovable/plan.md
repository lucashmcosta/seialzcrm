# Fiação Evolution — destino do número no próprio fluxo de conexão

Escopo: somente Evolution. Meta e Twilio não são tocados. `provision_sales_endpoint` permanece no banco (apenas deixa de ser chamada pelo Evolution).

## Experiência

Configurações → Integrações → Evolution WhatsApp → **Conectar novo número**:

1. **Passo 1 — Destino**: escolher Comercial, Atendimento ou Pessoal. Se Pessoal, escolher o usuário responsável (obrigatório; botão de continuar desabilitado sem isso).
2. **Passo 2 — QR**: criação da sessão e leitura do QR exatamente como hoje, sem nenhuma alteração.
3. **Passo 3 — Finalizar**: quando a sessão estiver conectada e com o número já lido do provedor, o botão de vínculo finaliza usando o destino escolhido no Passo 1. O botão passa a exibir o destino (ex.: "Vincular ao Comercial", "Vincular ao Atendimento", "Vincular a Pessoal — Nome").

Sessões pendentes que já existiam (criadas antes desta mudança, sem destino escolhido) recebem, na própria linha da lista, um seletor de destino compacto antes de habilitar o vínculo. Nada é assumido silenciosamente.

## Mapeamento

| Destino | Route | purpose | assigned_user_id |
| --- | --- | --- | --- |
| Comercial | sales | commercial | nulo |
| Atendimento | customer_service | customer_service | nulo |
| Pessoal | sales | vendor_personal | usuário escolhido |

## Detalhes técnicos

**Edge `sales-route-operations`, caso `linkPendingInstance`** (única operação alterada):
- Passa a aceitar `purpose` (`commercial` | `customer_service` | `vendor_personal`) e `assignedUserId` opcional. Sem `purpose`, mantém `commercial` (compatibilidade).
- Valida entrada: purpose fora da lista → `INVALID_INPUT`; `vendor_personal` sem `assignedUserId` → `INVALID_INPUT`; `assignedUserId` presente com outro purpose → `INVALID_INPUT`.
- Resolve a Route pela `inbox_key` correspondente (`sales` para commercial/vendor_personal, `customer_service` para Atendimento); erro `SALES_ROUTE_NOT_FOUND` / `CUSTOMER_SERVICE_ROUTE_NOT_FOUND` quando ausente.
- Troca a chamada `caller.rpc('provision_sales_endpoint', …)` por `caller.rpc('provision_line_endpoint', …)` com `p_purpose` e `p_assigned_user_id`. O número continua vindo exclusivamente de `owner_number_digits`, nunca do frontend.
- Todas as pré-condições atuais (pending, `open`, identidade conhecida, org própria) permanecem idênticas. `createInstance`, `connect`/QR, `syncWebhook`, `deleteInstance`, healthcheck e webhook não são tocados.

**Frontend**:
- `src/hooks/useEvolutionProvisioning.ts`: `useLinkPendingInstance` passa a receber `{ instanceId, purpose, assignedUserId }`.
- `src/components/integrations/evolution-whatsapp/EvolutionProvisionPanel.tsx`: novo passo de destino usando o `EndpointDestinationStep` já existente, estado local `destinationByInstance` (preenchido ao criar a sessão), seletor de fallback para pendentes antigas, rótulo do botão por destino e mensagens de erro novas (`PROVISION_ASSIGNED_USER_REQUIRED`, `PROVISION_ASSIGNED_USER_INVALID`, `PROVISION_PURPOSE_LINE_MISMATCH`, `PROVISION_ENDPOINT_PURPOSE_CONFLICT`, `CUSTOMER_SERVICE_ROUTE_NOT_FOUND`).

## Invariantes garantidas

META_CHANGED=NO · TWILIO_CHANGED=NO · EVOLUTION_QR_FLOW_CHANGED=NO · EVOLUTION_CREATE_INSTANCE_CHANGED=NO · EVOLUTION_DELETE_CHANGED=NO · EVOLUTION_HEALTHCHECK_CHANGED=NO · EVOLUTION_WEBHOOK_CHANGED=NO · PROVISION_CHANGES_ACTIVE_ENDPOINT=NO · ROUND_ROBIN_CHANGED=NO · THREAD_MODEL_CHANGED=NO · ASSIGNMENT_RULES_CHANGED=NO

Nenhuma migração de banco nesta etapa.

## Verificação antes da sua validação manual

typecheck (`tsgo`), build, `deno check` da função alterada e diff real dos arquivos tocados. Depois disso, paro para sua validação manual — Twilio não começa nesta etapa.
