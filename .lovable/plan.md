## Objetivo

Corrigir apenas a origem dos dados do dropdown "Enviar de" em `/messages` para esconder endpoints que não conseguem enviar WhatsApp. **Nenhuma mudança em banco, migration ou `communication_endpoints`.**

## Diagnóstico dos endpoints WhatsApp da Central Trabalhista (hoje)

Consulta direta em `communication_endpoints` retornou 7 linhas para a CT no canal `whatsapp`. Classificação:

| external_address | sender_sid | status | metadata.source | Operacional? |
|---|---|---|---|---|
| +14155238886 (sandbox) | XE599ab5…df1d | offline | (null) | Sandbox — esconder |
| +551140403128 | **null** | unknown | available_numbers | Não — número Twilio bruto |
| +551150265098 | XE65b18bb8…ac34 | online | (null) | **Sim** |
| +551150281820 | **null** | unknown | available_numbers | Não |
| +551150283680 | **null** | unknown | available_numbers | Não |
| +551150286860 | **null** | unknown | available_numbers | Não |
| +551150287027 | XE4e6a553e…b385 | online | (null) | **Sim** |

Padrão claro: senders WhatsApp reais têm `sender_sid` preenchido e `status` ∈ {`online`,`offline`}; os 4 fantasmas vieram da Twilio Available Numbers API (`metadata.source = 'available_numbers'`), têm `sender_sid = null` e `status = 'unknown'`.

## Mudança (somente frontend, 1 arquivo)

**`src/hooks/useOrgWhatsAppEndpoints.ts`** — acrescentar dois filtros à query Supabase do hook:

```text
.not('sender_sid', 'is', null)   // só senders WhatsApp reais
.neq('status', 'offline')        // esconde sandbox (e qualquer sender desativado pela Twilio)
```

Mantém os filtros já existentes (`organization_id`, `channel='whatsapp'`, `is_active=true`).

Sem alterações em:
- `EndpointSelector.tsx`, `EndpointBadge.tsx`, `useThreadEndpointMap.ts`
- `MessagesList.tsx`
- `twilio-whatsapp-send` (roteamento de envio inalterado)
- Banco, migration, seed, RLS

## Resultado esperado por organização

**Central Trabalhista** — dropdown passa a mostrar **2 números**:
- `+551150265098` (…5098)
- `+551150287027` (…7027)

Quando o Lucas cadastrar o número novo pelo `twilio-whatsapp-setup`, ele aparecerá automaticamente como 3ª opção (será criado com `sender_sid` preenchido e `status='online'`, satisfazendo os dois filtros).

**Viagi** — continua sem dropdown (tem só 1 endpoint operacional, e a regra `hasMultiple = endpoints.length >= 2` esconde o seletor para orgs single-endpoint).

**Sandbox `+14155238886`** — oculto na CT por estar com `status='offline'`. Se um dia a Twilio reativar o sandbox para teste, ele voltaria a aparecer — comportamento aceitável.

## Validação pós-deploy

1. Login como usuário da CT → `/messages` → abrir composer → dropdown lista exatamente `…5098` e `…7027`.
2. Login como Viagi → `/messages` → dropdown não aparece (single-endpoint).
3. Confirmar no console que `useOrgWhatsAppEndpoints` retorna `endpoints.length === 2` para CT.
4. Enviar uma mensagem de teste pela CT escolhendo `…7027` → confirmar que `messages.endpoint_id` é stampado e `From` correto sai na Twilio (sem mudança de comportamento de envio).

## Reversão

Remover as duas linhas adicionadas ao hook restaura o estado atual (7 endpoints visíveis para CT).
