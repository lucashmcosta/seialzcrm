## Diagnóstico da Etapa 2

A mensagem para o 7067 chegou ao webhook (`From: +5511964298621, To: +551150287067, Body: Falaaa`), mas foi **rejeitada** com:

```
[CROSS-ORG] Message To +551150287067 does NOT match org 40ae935c... configured number +551150287027
[SECURITY] To number +551150287067 not found in ANY org. Rejecting.
```

Causa: o bloco de cross-org em `twilio-whatsapp-webhook/index.ts` (linhas 476-519) só procura o número em `organization_integrations.config_values.whatsapp_number` (o número "oficial" da org). Ele **não considera** `communication_endpoints`, onde está cadastrado o sender adicional 7067 (`b303253e-…`, org `40ae935c-…`). Resultado: o número é tratado como desconhecido e a mensagem é descartada antes de qualquer outra lógica.

Os outbounds pelo 7067 funcionam porque `twilio-whatsapp-send` usa `endpoint_id` diretamente; só o inbound estava bloqueado.

## Plano revisado

### Etapa 2.1 — Corrigir cross-org lookup (NOVO, pré-requisito da Etapa 3)

Em `supabase/functions/twilio-whatsapp-webhook/index.ts`, dentro do bloco `if (toNormalized !== configNormalized)`:

1. Manter a busca atual em `organization_integrations` (número primário).
2. Se não encontrar, fazer fallback em `communication_endpoints`:
   ```text
   select organization_id, sender_sid
   from communication_endpoints
   where channel='whatsapp'
     and is_active=true
     and regexp_replace(external_address,'\D','','g') = toNormalized
   limit 1
   ```
3. Se encontrar, sobrescrever `orgId` com `organization_id` do endpoint e recarregar `organization_integrations` daquela org para obter `account_sid`, `auth_token` e `whatsapp_inbound_settings` (a integração da org continua sendo a fonte de credenciais; o endpoint só roteia).
4. Só rejeitar com `[SECURITY] not found` se ambos (integrations e endpoints) falharem.

Sem essa mudança, qualquer Etapa 3 fica inútil — a mensagem nem chega na lógica de thread.

### Etapa 2.2 — Reteste inbound 7067

Após o deploy:
- Usuário envia nova mensagem do número pessoal para o 7067.
- Confirmar nos logs: nenhum `[SECURITY] Rejecting`, `resolve_communication_endpoint` retorna `b303253e-a7f3-49b7-b92f-efdeb12071f4`, e a mensagem é salva com `endpoint_id = b303253e-…`.
- Se OK, seguir para Etapa 3. Se não, parar e ajustar.

### Etapa 3 — Separar threads por endpoint (como já aprovado)

Em `twilio-whatsapp-webhook/index.ts`, na busca de thread existente (linha ~736):
- Match preferencial: `(organization_id, contact_id, channel='whatsapp', primary_endpoint_id = endpointId)`.
- Fallback (compatibilidade): se não houver thread com esse endpoint, aceitar thread com `primary_endpoint_id IS NULL` e fazer backfill com o endpoint atual (já há lógica de backfill nas linhas 754-755 — manter).
- Se nenhum match, criar nova thread com `primary_endpoint_id = endpointId`.

Resultado esperado: inbound do 7067 cria/usa thread distinta da thread legada do 7027.

### Etapa 4 — UI

1. **`MessagesList.tsx`**: remover o dropdown "Enviar de" do composer. `twilio-whatsapp-send` continua roteando pelo `primary_endpoint_id` da thread.
2. **`useOrgWhatsAppEndpoints.ts`**: expor `officialNumbers: Set<string>` montado a partir de `organization_integrations.config_values.whatsapp_number` (normalizado).
3. **`EndpointBadge.tsx`**: só renderizar o badge `via …NNNN` quando o `external_address` do endpoint da thread **não** estiver em `officialNumbers`. Threads do 7027 ficam sem badge; threads do 7067 mostram `via …7067`.

## Fora de escopo (mantido)

- `twilio-whatsapp-send` (não mexer).
- Threads antigas mistas (não migrar/excluir).
- Webhook do 7067 já foi configurado na Etapa 1.

## Arquivos a alterar

- `supabase/functions/twilio-whatsapp-webhook/index.ts` (Etapas 2.1 e 3)
- `src/components/messages/MessagesList.tsx` (remover dropdown)
- `src/hooks/useOrgWhatsAppEndpoints.ts` (expor officialNumbers)
- `src/components/messages/EndpointBadge.tsx` (badge condicional)
