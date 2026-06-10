## Problema

No `twilio-whatsapp-send`, quando o contato não tem `primary_endpoint_id` (NULL) ou o endpoint não pertence à org, o fallback atual busca **qualquer** endpoint WhatsApp da org em `communication_endpoints` — sem validar se aquele endpoint corresponde ao número Twilio que a org realmente configurou. Isso causou o vazamento cross-org (CT enviando pelo número da Viagi).

## Correção

Endurecer o fallback em `supabase/functions/twilio-whatsapp-send/index.ts` (trecho ~linhas 296-336) para filtrar pelo número configurado da própria org.

### Lógica nova

1. Buscar `organization_integrations` da org com slug `twilio-whatsapp` e ler `config_values.whatsapp_number`.
2. Normalizar (remover prefixo `whatsapp:`, espaços, garantir E.164).
3. Buscar endpoints WhatsApp da org filtrando por `external_address = <whatsapp_number normalizado>`.
4. Se encontrar → usa esse endpoint.
5. Se **não** encontrar → retorna **400** com log detalhado (org, número configurado, endpoints disponíveis) e **NÃO** faz fallback para qualquer endpoint aleatório.
6. Se a org não tem `whatsapp_number` configurado → mantém comportamento antigo (fallback amplo) para não quebrar orgs sem setup completo. Log de warning.

### Por que é seguro

- Orgs com Twilio configurado corretamente: continuam funcionando (endpoint bate com o número).
- Orgs sem `whatsapp_number`: fallback antigo preserva o envio.
- Único caso bloqueado: org tenta usar endpoint que **não pertence** ao seu próprio número Twilio — exatamente o bug.

### Logs adicionados

- `[SEND] Org whatsapp_number: <num>`
- `[SEND] Endpoint matched: <id>` ou
- `[SEND] No endpoint match for org number — blocking cross-org leak`

## Fora do escopo

- Não mexer no Railway (envio principal).
- Não alterar schema.
- Não tocar nos dados (já corrigidos).
