# Auditoria read-only — Destino de números (Meta vs Evolution) e plano mínimo

Somente leitura: nada foi alterado. Evidências de código, funções SQL e dados reais.

## 1. Como o Meta implementa a seleção de destino

Fluxo do dropdown "Finalidade":

- Componente: `src/components/integrations/meta-whatsapp-cloud/AddMetaWhatsAppNumberDialog.tsx` (linhas 42, 176-196). Hoje só oferece **duas** opções renderizadas: `customer_service` (Atendimento /inbox) e `commercial` (Comercial /messages). Não existe opção "Pessoal" nem "Outro" no radio — o tipo aceita `vendor_personal | other` (`src/services/metaWhatsAppService.ts:23`), mas a UI não os expõe.
- Service: `metaWhatsAppService.connect/addWaba` → Edge Function `meta-whatsapp-connect` (body `endpointPurpose`).
- Persistência: `supabase/functions/meta-whatsapp-connect/index.ts:626` e `:1014` gravam **apenas** `communication_endpoints.purpose` (default `customer_service`). Constraint: `purpose IN ('commercial','customer_service','vendor_personal','other')`.
- Tabelas alteradas: `organization_integrations`, `communication_endpoints`, `meta_app_credentials`, `organization_phone_numbers`. **Nenhum insert em `messaging_lines` / `messaging_line_endpoints`** (grep sem resultados nessa função).
- Inbound depois: `purpose` alimenta o trigger `fn_message_threads_autofill_business_context` (`commercial|sales` → `business_context='sales'`; `customer_service|support` → `customer_service`; qualquer outro valor → `other`, que fica em limbo). Para o caminho canônico Comercial, `_shared/sales-canonical-gate.ts` exige as 3 condições: purpose de vendas + **link ativo em `messaging_line_endpoints` com `messaging_lines.inbox_key='sales'`** + flag `conv_route_resolver_v2`.
- Outbound: `_shared/dispatch-whatsapp-send.ts:225-251` deriva purpose e resolve `messaging_lines.active_endpoint_id`; no frontend `src/lib/composerEndpoint.ts` filtra o pool por `purpose` (`SALES_PURPOSES = commercial, vendor_personal` / `CS_PURPOSES = customer_service, support, other`).

Conclusão: o dropdown do Meta **não é só visual** (controla `business_context` e o pool de outbound), mas **não é suficiente**: a entrada na Route (Comercial ou Atendimento) exige um vínculo em `messaging_line_endpoints` que a UI Meta não cria. Hoje esse vínculo só nasce por `provision_sales_endpoint` (Comercial) ou por SQL manual.

## 2. Suporte atual a "Pessoal"

PERSONAL_NUMBER_MODEL_EXISTS=PARTIAL

Já existe:
- `communication_endpoints.purpose = 'vendor_personal'` na constraint, e `SALES_PURPOSES` inclui `vendor_personal` (`src/lib/endpointPurpose.ts:7`).
- `communication_endpoints.assigned_user_id uuid` (coluna existe; **não é lida por nenhum código de WhatsApp** — os únicos usos de `assigned_user_id` fora de contatos/threads estão na telefonia, `telephony-*`).
- `messaging_lines.owner_user_id uuid` (coluna existe; nenhuma linha atual usa — ver dados no item 3).
- `user_reply_endpoints` (permissão usuário ↔ endpoint) com trigger `fn_guard_user_reply_endpoint`, que **hoje só aceita endpoints elegíveis ao Comercial** (`fn_is_sales_eligible_endpoint` exige `inbox_key='sales'`).

Falta:
- Nenhuma UI cria endpoint `vendor_personal`.
- Nenhuma regra de inbound trata número pessoal (o trigger de `business_context` joga `vendor_personal` para `other` → thread invisível em /messages e /inbox — exatamente o incidente documentado em `docs/integrations/evolution-api/ENDPOINT_PURPOSE_RULE.md`).
- Nenhuma Route pessoal (`inbox_key` só aceita `sales|customer_service`).
- `assigned_user_id` não é validado (sem trigger de org/usuário ativo) nem usado em outbound.

## 3. Atendimento

Dados reais de `messaging_lines`:

| org | inbox_key | ativa | active_endpoint_id |
|---|---|---|---|
| Central (40ae…a95f) | sales | sim | bf04ce63… (7067) |
| Central | customer_service | sim | c09bd713… (7027) |
| Viagi (b246…896a) | customer_service | sim | 03bdcb91… |
| Viagi | sales | sim | 34d9ec9d… |
| Viagi | sales | **não** | 11111111-e701… (piloto) |

- Inbound Atendimento: não passa pelo gate canônico (condição 1 barra purpose não-vendas); cai no caminho legado por `primary_endpoint_id` e é classificado por `purpose='customer_service'` → `business_context='customer_service'` → escopo do /inbox (`src/hooks/inbox/inboxScope.ts`).
- Outbound Atendimento: mesma resolução por linha (`dispatch-whatsapp-send`), pool filtrado por `CS_PURPOSES`.
- Nada no schema impede provider `evolution_api` no Atendimento (constraint de provider aceita). O bloqueio é **de código**: `provision_sales_endpoint` recusa linha não-sales (`PROVISION_NOT_SALES_ROUTE`, linha 151) e `sales-route-operations` filtra `inbox_key='sales'` (linhas 261 e 907).

EVOLUTION_CAN_ROUTE_TO_CUSTOMER_SERVICE_TODAY=PARTIAL (possível só por SQL manual; nenhuma via UI/RPC)

## 4. Comercial

Fluxo funcionando: instância Evolution (`evolution_instances`, estado `open` + `owner_number_digits`) → `sales-route-operations` op de link → RPC `provision_sales_endpoint` → cria/reusa `communication_endpoints` → link em `messaging_line_endpoints` → gate canônico + resolver V2 no inbound/outbound.

EVOLUTION_CURRENT_FLOW_HARDCODED_TO_COMMERCIAL=YES

Pontos hardcoded:
- `provision_sales_endpoint`: `IF v_line.inbox_key IS DISTINCT FROM 'sales' THEN RAISE PROVISION_NOT_SALES_ROUTE` (linha 151) e `purpose` fixo `'commercial'` no INSERT do endpoint (linha 235).
- `supabase/functions/sales-route-operations/index.ts:261` e `:907` — busca a linha apenas com `.eq("inbox_key","sales")`.
- `src/components/integrations/evolution-whatsapp/EvolutionProvisionPanel.tsx` — texto e ação "vincular ao WhatsApp Comercial", sem escolha de destino; erro `SALES_ROUTE_NOT_FOUND`.
- `rotate_messaging_line_endpoint`: `ROTATION_NOT_SALES_ROUTE` (só troca ativo em rota de vendas).
- `fn_is_sales_eligible_endpoint` / `fn_guard_user_reply_endpoint`: permissão por usuário só existe para Comercial.

## 5. Contrato de destino proposto

```text
destination = { type: "commercial" | "customer_service" | "personal", userId?: uuid }
```

Mapeamento no modelo atual (sem inventar conceito novo):

| destino | purpose do endpoint | Route (messaging_lines) | dono |
|---|---|---|---|
| commercial | `commercial` | linha `inbox_key='sales'` compartilhada | — |
| customer_service | `customer_service` | linha `inbox_key='customer_service'` | — |
| personal | `vendor_personal` | linha `inbox_key='sales'` com `owner_user_id = userId` | `communication_endpoints.assigned_user_id = userId` + grant em `user_reply_endpoints` |

Encaixe: **commercial** encaixa 100%. **customer_service** encaixa no schema, exige generalizar a RPC (hoje bloqueia por `inbox_key`). **personal** reaproveita colunas já existentes (`assigned_user_id`, `owner_user_id`) e a tabela `user_reply_endpoints`; precisa de (a) tratamento de `vendor_personal` no trigger de `business_context` (hoje vira `other` = limbo) e (b) validação de dono. Não é preciso novo `inbox_key` nem nova tabela.

SCHEMA_CHANGE_REQUIRED=SIM, porém mínimo (funções/triggers, sem novas tabelas nem novas colunas).

## 6. UX alvo do Evolution (4 passos)

Passo 1 — destino: cartões `Comercial` / `Atendimento` / `Pessoal`; em Pessoal, select obrigatório de usuário da org. Passo 2 — criar instância. Passo 3 — QR. Passo 4 — quando `open`: ler identidade, criar/reusar endpoint, vincular ao destino escolhido automaticamente, sem "tornar ativo" (rotação continua ação explícita e separada).

## 7. Guardas — já existem vs faltam

Já existem: org correta (`current_user_org_ids` + `can_manage_integrations_in_org`), número normalizado (só dígitos) e lock advisory por org+número, provider-aware (famílias + `PROVISION_ADDRESS_ACTIVE_ON_OTHER_PROVIDER`), posse do número (instância `open` + `owner_number_digits` batendo), endpoint ativo, link sem apagar histórico (reativa a mesma row), `ROTATION_ENDPOINT_IN_USE` impedindo endpoint ativo em duas rotas, desconexão que nunca apaga threads/mensagens, `fn_guard_user_reply_endpoint` validando usuário↔org.

Faltam: validar que o `userId` do destino Pessoal pertence à org e está ativo; impedir reatribuição silenciosa de número pessoal a outro usuário; impedir que um endpoint `customer_service` entre em linha `sales` e vice-versa (hoje a RPC nem chega a comparar purpose vs `inbox_key`); tratamento de `vendor_personal` no trigger de `business_context`.

## 8. Compatibilidade

Nada reclassifica endpoints existentes: todas as mudanças propostas atuam apenas em **novos** vínculos/inserts. Central (7067 Meta comercial, 7020 Evolution comercial, 7020 Meta histórico inativo, 7027 Atendimento) e Viagi permanecem intactos. Sem backfill, sem UPDATE em massa, sem alteração de `active_endpoint_id`.

## 9. Resultado

- META_DESTINATION_MODEL=`communication_endpoints.purpose` escolhido na UI (só commercial/customer_service), sem criar vínculo de Route
- EVOLUTION_CURRENT_DESTINATION_MODEL=inexistente; sempre Comercial (`purpose='commercial'` fixo na RPC)
- PERSONAL_NUMBER_MODEL_EXISTS=PARTIAL (colunas e permissões existem; nenhuma regra de roteamento nem UI)
- CUSTOMER_SERVICE_MODEL_EXISTS=YES (linha `inbox_key='customer_service'` ativa nas duas orgs)
- EVOLUTION_CAN_ROUTE_TO_COMMERCIAL=YES (100% por UI)
- EVOLUTION_CAN_ROUTE_TO_CUSTOMER_SERVICE=NO por UI/RPC (PARTIAL só por SQL manual)
- EVOLUTION_CAN_ROUTE_TO_PERSONAL=NO
- SCHEMA_CHANGE_REQUIRED=YES (mínimo: RPC generalizada + trigger de `business_context` + guardas; sem novas tabelas/colunas)
- BACKEND_CHANGE_REQUIRED=YES (`sales-route-operations`, RPC de provisionamento)
- UI_CHANGE_REQUIRED=YES (passo de destino no Evolution; opcionalmente expor Pessoal no Meta)
- SAFE_TO_IMPLEMENT=YES, em fases, todas aditivas

| Destino | Meta hoje | Evolution hoje | Backend existe? | UI existe? | O que falta |
|---|---|---|---|---|---|
| Comercial | purpose `commercial` (link de Route manual) | completo via `provision_sales_endpoint` | Sim | Sim | nada |
| Atendimento | purpose `customer_service` (link manual) | não suportado | Parcial (linha existe; RPC bloqueia) | Não | generalizar RPC + destino na UI |
| Pessoal | não exposto na UI | não suportado | Parcial (colunas + `user_reply_endpoints`) | Não | purpose `vendor_personal` roteável, dono validado, UI |

## Plano mínimo de implementação (por fases, aditivo)

**Fase A — Comercial (nada a fazer)**: apenas incluir o passo de destino na UI com "Comercial" pré-selecionado, mantendo o caminho atual byte-a-byte.

**Fase B — Atendimento**
1. Migração: nova RPC `provision_line_endpoint(p_organization_id, p_line_id, p_provider, p_address, p_purpose, p_display_name, p_instance_name, p_assigned_user_id)` — cópia endurecida de `provision_sales_endpoint`, aceitando `inbox_key IN ('sales','customer_service')`, gravando `purpose` conforme o destino e recusando purpose incompatível com o `inbox_key` da linha. `provision_sales_endpoint` fica intacta (compat).
2. `sales-route-operations`: nova op `link_instance_to_destination` que resolve a linha por `inbox_key` derivado do destino e chama a nova RPC. Ops atuais inalteradas.
3. UI: passo 1 com Comercial/Atendimento.

**Fase C — Pessoal**
1. Migração: (a) trigger `fn_message_threads_autofill_business_context` passa a mapear `vendor_personal` → `sales` (em vez de `other`), evitando limbo; (b) na nova RPC, destino `personal` exige `p_assigned_user_id` validado contra `user_organizations` + usuário ativo, grava `communication_endpoints.assigned_user_id`, cria/usa linha `inbox_key='sales'` com `owner_user_id = userId`, e insere o grant em `user_reply_endpoints` para esse usuário; (c) guarda impedindo trocar `assigned_user_id` de um endpoint pessoal sem ação explícita.
2. UI: opção Pessoal + select de usuário obrigatório (usuários da org).
3. Efeito no "Responder por": o grant já faz o número aparecer só para o dono (`user_reply_endpoints` + `fn_guard_user_reply_endpoint`).

**Fase D — Validação**: smoke por destino (Comercial regressão, Atendimento novo número Evolution caindo em /inbox, Pessoal visível só ao dono), conferindo que os endpoints atuais das duas orgs não mudaram (`purpose`, `is_active`, `active_endpoint_id`).

Nenhuma alteração será feita antes da sua aprovação.
