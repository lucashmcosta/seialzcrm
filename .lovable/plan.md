
# Fase 1.3B — Envio real seguro pelo `/inbox`

Sem composer. Sem envio real ao cliente nesta fase. `/messages` intocado.

## Decisões aprovadas

1. **Sem feature flag.** Após reclassificação, `senderContext='inbox'` aceita **apenas** `purpose='customer_service'`. Bloqueia `commercial`, `vendor_personal`, `other`.
2. **Reclassificação 1-a-1.** Apenas o endpoint `c09bd713-0225-4533-afe8-20ac07bd3a7c` (Central Trabalhista). Nenhum outro endpoint é tocado.

## Ordem de execução

### Passo 1 — Auditoria de impacto (read-only)

`rg -n "purpose" src/ supabase/functions/` filtrando referências a `communication_endpoints.purpose`. Resultado esperado: só o branch dry-run da `twilio-whatsapp-send` consome `purpose` hoje. Se aparecer outro consumidor, paramos e reavaliamos antes do UPDATE.

### Passo 2 — UPDATE pontual de dados

Operação de DADO (não migration de schema), via `supabase--insert_data`:

```sql
UPDATE public.communication_endpoints
SET purpose = 'customer_service',
    provider = 'twilio',
    updated_at = now()
WHERE id = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'
  AND organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f';
```

Validação pós-UPDATE: `SELECT id, purpose, provider, external_address, sender_sid, is_active FROM communication_endpoints WHERE id = '…';` deve retornar `purpose='customer_service'`, `provider='twilio'`.

### Passo 3 — Dry-run de confirmação (antes do patch)

`curl_edge_functions` em `/twilio-whatsapp-send` com:

```json
{
  "organizationId": "40ae935c-a7f7-4ad7-8ea4-91be6404a95f",
  "threadId": "af945caf-b96a-4e55-8dad-38c5105ceafc",
  "senderContext": "inbox",
  "dryRun": true
}
```

Esperado:

```json
{
  "allowed": true,
  "reason": "ok",
  "warnings": [],
  "endpoint_id": "c09bd713-0225-4533-afe8-20ac07bd3a7c",
  "resolved_external_address": "+551150287027",
  "resolved_sender_sid": "XE4e6a55…",
  "resolved_from": null,
  "current_global_whatsapp_from": "whatsapp:+551150287027"
}
```

O warning `endpoint_purpose_other` deve desaparecer. Se não desaparecer, paramos antes do patch.

### Passo 4 — Patch de envio real em `twilio-whatsapp-send`

Único arquivo: `supabase/functions/twilio-whatsapp-send/index.ts`.

Forma:

```text
parse body { ..., senderContext, dryRun }

if dryRun === true: (já implementado, sem mudança)

if senderContext === 'inbox' && dryRun !== true:
    require threadId                         → 400 'missing_thread'
    load thread (org-scoped)                 → 404 se não existir
    require thread.primary_endpoint_id       → 400 'no_endpoint'
    load endpoint
    guard():
      is_active=false                         → 400 'endpoint_inactive'
      channel !== 'whatsapp'                  → 400 'wrong_channel'
      purpose IN ('commercial','vendor_personal','other')
                                              → 400 'purpose_blocked'
      purpose !== 'customer_service'          → 400 'purpose_blocked'
      !organization_integration_id            → 400 'integration_missing'
      !external_address                       → 400 'sender_data_missing'
      !/^\+\d{8,15}$/.test(external_address)  → 400 'sender_data_missing'
    whatsappFrom := `whatsapp:${endpoint.external_address}`
    endpointId   := endpoint.id   # não usar resolve_communication_endpoint no caminho inbox
    # AccountSid/AuthToken continuam vindo de organization_integrations
    continue → fluxo existente (24h, template, insert message com endpoint_id, Twilio call, status callback)

senão (default 'messages'): fluxo atual byte-a-byte (sem mudança)
```

Sem RPC nova. Sem migration. Sem RLS. Sem alteração em `resolve_communication_endpoint`. Sem alteração em `whatsapp_from` global. Sem mexer em `/messages`.

Logs do branch novo com prefixo `[inbox-send]`.

### Passo 5 — Dry-run pós-patch (sem envio real)

Repetir as 3 chamadas do dry-run para validar zero regressão:

| Cenário | Esperado |
|---|---|
| Thread CS reclassificada (`af945caf…`) | `allowed: true, reason: 'ok', warnings: []` |
| Thread sem `primary_endpoint_id` (`10b41d35…`) | `allowed: false, reason: 'no_endpoint'` |
| Thread inexistente (`0000…`) | `allowed: false, reason: 'missing_thread'` |

O patch de envio real **não pode** alterar o JSON do dry-run.

### Passo 6 — Pausa obrigatória

Parar antes de qualquer envio real. Aguardar aprovação explícita sua para discutir o teste real único e controlado (que **não** acontece nesta fase).

## Fora de escopo

- Composer `/inbox`, templates `/inbox`, upload, áudio, notas internas, reply.
- Envio real ao cliente (qualquer canal).
- Reclassificação de outros endpoints.
- Feature flag `INBOX_ALLOW_PURPOSE_OTHER` (descartada).
- Migration de schema, RLS nova, RPC nova, `inbox_audit_log`.
- UI de gestão de `communication_endpoints`.
- Alteração em `/messages`, `WhatsAppChat.tsx`, hooks do Inbox, `resolve_communication_endpoint`, Twilio setup, Meta Cloud.
- Fase 1.3C.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| UPDATE quebrar outro consumidor de `purpose` | Passo 1 (grep) antes do UPDATE. |
| `external_address` sem `+` ou inválido | Guard regex `^\+\d{8,15}$` → `sender_data_missing`. |
| Patch alterar comportamento de `/messages` | Branch só ativa com `senderContext='inbox'`. Diff revisado linha-a-linha. |
| `endpoint_id` registrado em `messages` divergir do que `resolve_communication_endpoint` retornaria | Não diverge: ambos resolvem para `c09bd713…` neste cenário (mesmo `external_address`). |

## Entregáveis ao final da fase

1. Resultado do grep do Passo 1 (texto).
2. Confirmação SQL do Passo 2 (linha atualizada).
3. JSON do dry-run pós-UPDATE (Passo 3).
4. Diff do patch (Passo 4).
5. JSON dos 3 dry-runs pós-patch (Passo 5).

Sem composer. Sem envio real. Sem 1.3C.
