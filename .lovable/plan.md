## Etapa 3 + Etapa 4 — separar threads por endpoint e ajustar UI

### Etapa 3 — Match de thread por `primary_endpoint_id` no webhook

Em `supabase/functions/twilio-whatsapp-webhook/index.ts` (linhas 770–825), trocar a query única atual por uma busca em duas etapas:

1. **Match preferencial (reutilização)** — `(org, contact, channel='whatsapp', primary_endpoint_id = endpointId)`. Se existir, reutiliza essa thread (evita criar uma thread nova a cada inbound do 7067).
2. **Fallback de compatibilidade** — se não houver match e `endpointId` estiver definido, procurar thread com `primary_endpoint_id IS NULL` (legado 7027) e fazer backfill com o endpoint atual.
3. **Criar nova thread** com `primary_endpoint_id = endpointId` apenas se nenhum dos dois bater.

Quando `endpointId` for `null` (caso raro), manter o comportamento atual: match único por `(org, contact, channel)`.

### Etapa 4 — UI

**`src/hooks/useOrgWhatsAppEndpoints.ts`**
- Expor `officialNumbers: Set<string>` (dígitos normalizados de `organization_integrations.config_values.whatsapp_number`).

**`src/components/messages/EndpointBadge.tsx`**
- Nova prop opcional `officialNumbers?: Set<string>`. Se o `externalAddress` normalizado estiver no set, retorna `null`. Caso contrário, renderiza `via …NNNN` como hoje.

**`src/pages/messages/MessagesList.tsx`**
- Passar `officialNumbers` do hook para os dois `<EndpointBadge>` (linhas 193 e 1412).
- Remover o bloco `<EndpointSelector>` (linhas 1825–1834) e o import. O envio continua roteado pelo `primary_endpoint_id` da thread; `composerEndpointId` cai automaticamente para o endpoint primário da thread.

### Fora de escopo
- `twilio-whatsapp-send` (intacto)
- Threads antigas mistas (sem migração/exclusão)
- Arquivo `EndpointSelector.tsx` (permanece no repo, apenas deixa de ser usado)

### Arquivos alterados
- `supabase/functions/twilio-whatsapp-webhook/index.ts`
- `src/hooks/useOrgWhatsAppEndpoints.ts`
- `src/components/messages/EndpointBadge.tsx`
- `src/pages/messages/MessagesList.tsx`

### Validação
Após o deploy, enviar nova mensagem do número pessoal para o 7067:
- Aparece nova conversa "Joao Teste" na lista, com badge `via …7067`.
- Mensagens subsequentes do 7067 caem na mesma nova thread (sem duplicar).
- Thread antiga do 7027 continua existindo, **sem badge**.
- Composer sem dropdown "Enviar de".