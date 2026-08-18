# Fase 3 — Provisionamento por destino (Comercial / Atendimento / Pessoal)

Escopo: apenas o momento de **adicionar um número**. Nada de backfill, nada de troca automática de número padrão, nada de mudança no modelo de threads.

## Estado atual verificado

- `provision_sales_endpoint(p_organization_id, p_line_id, p_provider, p_address, p_display_name, p_instance_name)` recusa linha com `inbox_key <> 'sales'` (`PROVISION_NOT_SALES_ROUTE`) e sempre grava `purpose='commercial'` na criação. Nunca toca `active_endpoint_id` (correto, mantemos).
- `rotate_messaging_line_endpoint` recusa linha não-sales (`ROTATION_NOT_SALES_ROUTE`) — é a função de "Tornar padrão".
- `sales-route-operations`: op `status` e `provisionEndpoint` filtram `inbox_key='sales'`; não existe conceito de destino.
- Linhas existentes: cada org tem uma linha `sales` e uma `customer_service` (whatsapp), todas com `active_endpoint_id` já definido.
- Meta: `AddMetaWhatsAppNumberDialog` já escolhe `commercial | customer_service` e envia `endpointPurpose` para `meta-whatsapp-connect`, que apenas grava `purpose` no endpoint — **não cria o vínculo** em `messaging_line_endpoints`. Falta "Pessoal" e falta o vínculo com a Route.
- `communication_endpoints.assigned_user_id` existe (FK `users.id`) e a Fase 2 já autoriza resposta pessoal exclusivamente por ele.

## O que será implementado

### 1. Migração — RPC genérica `provision_line_endpoint`

Nova função (a `provision_sales_endpoint` permanece intacta para compatibilidade), assinatura:

```
provision_line_endpoint(
  p_organization_id uuid, p_line_id uuid, p_provider text, p_address text,
  p_purpose text, p_display_name text default null,
  p_instance_name text default null, p_assigned_user_id uuid default null)
```

Regras:
- Mesma autorização, whitelist de provider, normalização de número, locks e reuso/criação de endpoint da função atual.
- Aceita `inbox_key IN ('sales','customer_service')`; canal deve ser `whatsapp`.
- Matriz de compatibilidade obrigatória (qualquer outra combinação → `PROVISION_PURPOSE_LINE_MISMATCH`):
  - `commercial` → linha `sales`
  - `vendor_personal` → linha `sales`
  - `customer_service` → linha `customer_service`
- `vendor_personal` exige `p_assigned_user_id` (`PROVISION_ASSIGNED_USER_REQUIRED`), validado como usuário ativo da org (`PROVISION_ASSIGNED_USER_INVALID`); grava `assigned_user_id` no endpoint. Nenhum grant em `user_reply_endpoints`.
- Na criação grava o `purpose` recebido. No reuso, só ajusta `purpose`/`assigned_user_id` quando o endpoint ainda não tem vínculo ativo divergente — nunca reclassifica um endpoint já ativo em outra Route (`PROVISION_ENDPOINT_PURPOSE_CONFLICT`).
- Cria/reativa o vínculo em `messaging_line_endpoints` e mantém o mapeamento Evolution idempotente.
- **Nunca** escreve `messaging_lines.active_endpoint_id`.

Também: `rotate_messaging_line_endpoint` passa a aceitar `inbox_key IN ('sales','customer_service')` (demais gates, admin-only e log em `messaging_line_rotations` inalterados), para que "Tornar padrão" funcione no Atendimento.

### 2. Backend — edge functions

- `sales-route-operations`:
  - op `status`: passa a listar linhas `sales` **e** `customer_service`, cada rota com seu `inboxKey`.
  - op `provisionEndpoint`: aceita `destination: 'commercial' | 'customer_service' | 'vendor_personal'` + `assignedUserId`, resolve a linha pelo destino (linha ativa da org com o `inbox_key` correspondente) e chama `provision_line_endpoint`. Validação Evolution de identidade real antes da RPC permanece.
- `meta-whatsapp-connect`: aceita `endpointPurpose='vendor_personal'` com `assignedUserId` e, após criar/atualizar o endpoint, chama `provision_line_endpoint` com o destino escolhido para criar o vínculo com a Route correta. Sem alterar `active_endpoint_id`.

### 3. UI

- Novo componente compartilhado `DestinationStep` (radio Comercial / Atendimento / Pessoal + `Select` de usuário obrigatório quando Pessoal; botão desabilitado sem usuário).
- `SalesWhatsAppSettingsSection` (Evolution/Twilio/Meta): destino como **passo 1** do formulário de novo número; hook `useSalesRouteManager.provisionEndpoint` passa `destination`/`assignedUserId`.
- `AddMetaWhatsAppNumberDialog`: adiciona a opção "Pessoal" + select de usuário no radio de destino existente.
- Lista de números: exibe o destino do número (Comercial / Atendimento / Pessoal · Nome) e mantém "Tornar padrão" como ação separada, agora também nas linhas de Atendimento.
- Fonte dos usuários: usuários ativos da org (`users` + `user_organizations`) em um hook novo pequeno.

## Fora de escopo

Backfill, reclassificação de endpoints existentes, troca automática de padrão, novas Routes/inboxes, mudanças de thread ou de autorização de resposta (Fase 2 já entregue).

## Validação a entregar

Ensaio em transação com ROLLBACK cobrindo: provisionamento Comercial, Atendimento e Pessoal (Meta/Twilio/Evolution), combinações inválidas purpose×inbox_key recusadas, `vendor_personal` sem usuário recusado, e conferência de que `active_endpoint_id` das 5 linhas atuais não mudou. Ao final: `COMMERCIAL_PROVISION`, `CUSTOMER_SERVICE_PROVISION`, `PERSONAL_PROVISION`, `ACTIVE_ENDPOINT_AUTOMATIC_CHANGE`, `THREAD_MODEL_CHANGED`, `BACKFILL_EXECUTED`, `META_FLOW_SUPPORTED`, `EVOLUTION_FLOW_SUPPORTED`, `TWILIO_FLOW_SUPPORTED`, `TYPECHECK`.
