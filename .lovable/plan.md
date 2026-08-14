# Auditoria: mesmo número em dois providers (Meta 7020 → Evolution 7020)

Nada foi alterado. Nenhum write executado. O endpoint Meta 7020 (`407ff93d…`) permanece intocado.

## 1. Origem exata do conflito

`public.provision_sales_endpoint(uuid,uuid,text,text,text,text)` — passo 5 ("identidade do endpoint"):

```sql
SELECT count(*) FROM communication_endpoints
 WHERE organization_id = p_organization_id AND channel = 'whatsapp'
   AND regexp_replace(COALESCE(external_address,''),'\D','','g') = v_digits;
-- se 1 linha: carrega provider e:
IF v_ep_provider IS NOT NULL AND NOT (v_ep_provider = ANY (v_family)) THEN
  RAISE EXCEPTION 'PROVISION_PROVIDER_CONFLICT';
```

Para `p_provider='evolution'`, `v_family = {evolution_api}`; o endpoint achado é `meta_cloud_api` → exceção. A busca é **por número, sem provider**, então o RPC trata "um número = um endpoint".

Segunda barreira, ainda não atingida: índice único `uq_comm_endpoints_org_channel_address` em `(organization_id, channel, external_address) WHERE external_address IS NOT NULL`. Mesmo se o passo 5 passasse, o INSERT do segundo endpoint 7020 falharia aqui.

## 2. Chave lógica atual de `communication_endpoints`

- `uq_comm_endpoints_org_channel_address` → **organization + channel + address** (provider NÃO entra).
- `uq_comm_endpoints_org_sender_sid` → organization + sender_sid.
- `communication_endpoints_meta_sender_sid_unique` → sender_sid global para família Meta.

Ou seja: hoje a identidade é `org + channel + address`; provider é atributo, não parte da chave.

## 3. Critério de busca do RPC

Exatamente o do item 1: `organization_id` + `channel='whatsapp'` + dígitos de `external_address`. Se houver >1 linha → `PROVISION_ENDPOINT_AMBIGUOUS`; se houver 1 com provider de outra família → `PROVISION_PROVIDER_CONFLICT`; se 0 → cria.

## 4. Quem assume "1 E.164 = 1 endpoint"

ADDRESS_ONLY (resolvem/deduplicam por número):
- `provision_sales_endpoint` (passos 5 e 6).
- Índice `uq_comm_endpoints_org_channel_address`.
- `twilio-whatsapp-webhook` — fallback cross-org: varre até 50 endpoints `channel='whatsapp' AND is_active` e casa por dígitos de `external_address` (`.find`, primeira ocorrência) para descobrir a org.
- UI/hooks de apresentação e dedupe por número: `useOrgWhatsAppEndpoints` (Set de números próprios), `useEndpointNumbers`, `whatsappEndpointDisplay`, seletores/filtros do composer.

PROVIDER_AWARE (não afetados):
- `meta-whatsapp-webhook` → `provider='meta_cloud_api' AND sender_sid = phone_number_id`.
- `evolution-webhook` → `evolution_instances.instance_name` → `endpoint_id`.
- `twilio-whatsapp-webhook` caminho principal → `messaging_service_sid` / `sender_sid`.
- Resolver V2 (`_shared/route-resolver.ts`) → sempre por `endpoint_id` (+ `is_active` + provider normalizado).
- `_shared/manual-reply-endpoint.ts` → por `endpoint_id`, com provider e org validados.
- `messages.endpoint_id`, `message_threads.primary_endpoint_id`, `messaging_line_endpoints`, `user_reply_endpoints`, `thread_reply_endpoint_prefs` → todos por id.

## 5. Ambiguidade com 7020 Meta inativo + 7020 Evolution ativo

- **Inbound**: nenhuma. Meta entra por `sender_sid`, Evolution por instância.
- **Outbound**: nenhuma no caminho V2/manual — tudo por `endpoint_id`; o Meta 7020 está `is_active=false`, então o resolver o rejeita.
- Riscos residuais: (a) o fallback do webhook Twilio por número (só define org — mesma org aqui, impacto nulo, mas é lookup frágil); (b) o próprio RPC, que passa a ver 2 linhas do mesmo número → `PROVISION_ENDPOINT_AMBIGUOUS` em provisionamentos futuros; (c) listas de UI podem exibir o número duas vezes.

## 6. Histórico Meta

`407ff93d…` (Central, `meta_cloud_api`, offline, inativo) é referenciado por:

```text
messages.endpoint_id          19.398
message_threads.primary_…      1.436
messaging_line_endpoints           1
messaging_line_rotations           1
user_reply_endpoints / prefs       0
```

Trocar o `provider` desse registro para `evolution_api` faria 19.398 mensagens históricas aparentarem ter saído/entrado pela Evolution — falsificação de auditoria. Apagar o endpoint quebraria/anularia 20.834 referências. **Não há motivo técnico para remover ou reprovisionar o endpoint Meta** — solução descartada.

## Veredito

```text
CONFLICT_SOURCE=provision_sales_endpoint passo 5 (PROVISION_PROVIDER_CONFLICT) + índice uq_comm_endpoints_org_channel_address
CURRENT_ENDPOINT_UNIQUENESS=organization_id + channel + external_address (provider fora da chave)
ADDRESS_ONLY_LOOKUPS=provision_sales_endpoint; uq_comm_endpoints_org_channel_address; twilio-whatsapp-webhook (fallback cross-org); hooks/UI de dedupe por número
PROVIDER_AWARE_LOOKUPS=meta-whatsapp-webhook (sender_sid); evolution-webhook (instance_name); twilio principal (messaging_service_sid); route-resolver V2; manual-reply-endpoint; messages.endpoint_id; message_threads.primary_endpoint_id; messaging_line_endpoints; user_reply_endpoints
HISTORICAL_META_ENDPOINT_MUST_BE_PRESERVED=YES
CROSS_PROVIDER_SAME_NUMBER_SAFE_TODAY=NO (bloqueado por RPC + índice; resolvers já seriam seguros)
SCHEMA_CHANGE_REQUIRED=YES
RPC_CHANGE_REQUIRED=YES
WEBHOOK_CHANGE_REQUIRED=NO
RESOLVER_CHANGE_REQUIRED=NO
META_HISTORY_RISK=NONE (com o plano abaixo)
READY_FOR_SAFE_FIX=YES
```

## Correção mínima proposta (a aprovar, nada implementado)

1. **Unicidade passa a incluir provider, com trava anti-ambiguidade**
   - Substituir `uq_comm_endpoints_org_channel_address` por:
     - `UNIQUE (organization_id, channel, external_address, provider) WHERE external_address IS NOT NULL` — permite 7020 Meta + 7020 Evolution;
     - `UNIQUE (organization_id, channel, external_address) WHERE external_address IS NOT NULL AND is_active` — garante **no máximo um endpoint ATIVO por número físico**, eliminando toda ambiguidade de envio e o fallback do Twilio.
   - Validação bloqueante antes: nenhum par (org, channel, address) com 2+ ativos hoje.

2. **RPC `provision_sales_endpoint`: busca passa a ser por número + família de provider**
   - Passo 5 filtra também `provider = ANY(v_family)` (tratando `provider IS NULL` como adotável apenas quando não houver candidato de outra família).
   - Endpoints de outra família com o mesmo número deixam de causar `PROVISION_PROVIDER_CONFLICT`; passam a exigir que estejam inativos (senão erro novo `PROVISION_ADDRESS_ACTIVE_ON_OTHER_PROVIDER`, fail-closed).
   - Cria um endpoint Evolution novo; **nunca** altera provider de endpoint existente.

3. **UI**: agrupar por número mostrando uma linha por provider, com badge "Histórico" quando inativo (ajuste apenas de apresentação, opcional nesta etapa).

Não muda: webhooks, Resolver V2, `active_endpoint_id`, rotações, Atendimento, Meta 7067.

Pós-condições a validar após aplicar:

```text
META_7020_ENDPOINT_ID_UNCHANGED=PASS
META_7020_PROVIDER_UNCHANGED=PASS
MESSAGES_ENDPOINT_REFS_UNCHANGED=19398
THREADS_PRIMARY_ENDPOINT_REFS_UNCHANGED=1436
EVOLUTION_ENDPOINT_CREATED=YES (novo id)
ACTIVE_ENDPOINT_CHANGED=NO (Meta 7067)
MESSAGING_LINE_ROTATIONS_NEW=0
ATENDIMENTO_CHANGED=NO
```
