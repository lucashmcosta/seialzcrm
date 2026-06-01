
# Fase 1.3A — Dry-run de validação de endpoint (somente leitura)

Escopo único: `supabase/functions/twilio-whatsapp-send/index.ts`. Nada mais.

Sem composer. Sem envio real. Sem mudar comportamento de `/messages`. Sem alterar como o `From` real é montado.

---

## 1. Novo parâmetro de entrada

Adicionar dois campos opcionais ao body:

- `senderContext?: 'inbox' | 'messages'` — default `'messages'`.
- `dryRun?: boolean` — default `false`.

Quando `senderContext !== 'inbox'` **e** `dryRun !== true`, o código segue exatamente o fluxo de hoje, byte-a-byte (nenhum branch novo executado). Isso garante zero risco para `/messages`.

## 2. Branch dry-run (somente leitura, zero side effects)

Quando `dryRun === true`:

- **Não** chamar Twilio.
- **Não** inserir em `messages`.
- **Não** inserir em `activities`.
- **Não** atualizar `message_threads` (nem `updated_at`, nem `primary_endpoint_id` backfill, nem `whatsapp_last_inbound_at`).
- **Não** chamar `resolve_communication_endpoint` com efeito de escrita (a RPC atual é leitura, mas evitamos chamá-la em caminho que cause backfill posterior — o dry-run sai antes).
- Apenas SELECTs.

Se `dryRun === true` **e** `senderContext !== 'inbox'`, retornar 400 `{ error: 'dryRun is only supported with senderContext=inbox' }` — para não criar uma porta lateral em `/messages`.

## 3. Guarda de endpoint (apenas avaliação, sem alterar `From` real)

Validações executadas (só leitura):

1. `threadId` obrigatório → senão `reason: 'missing_thread'`.
2. Carregar `message_threads` por id+org → `primary_endpoint_id`, `whatsapp_last_inbound_at`, `channel`.
3. Se `primary_endpoint_id IS NULL` → `allowed: false, reason: 'no_endpoint'`.
4. Carregar `communication_endpoints` por id.
5. `is_active = false` → `endpoint_inactive`.
6. `channel != 'whatsapp'` → `wrong_channel`.
7. `purpose IN ('commercial','vendor_personal')` → `purpose_blocked`.
8. `purpose = 'other'` → `allowed: true`, adicionar warning `endpoint_purpose_other` (temporário até reclassificação).
9. `organization_integration_id IS NULL` → `integration_missing`.
10. `sender_sid IS NULL` **e** `external_address IS NULL` → `sender_data_missing`.

Sem chamar Twilio. Sem decidir formato real do `From`. Apenas relatar os candidatos.

## 4. Formato da resposta do dry-run

```json
{
  "dryRun": true,
  "allowed": true,
  "reason": "ok",
  "warnings": ["endpoint_purpose_other"],
  "thread_id": "...",
  "endpoint_id": "...",
  "resolved_sender_sid": "XE4e6a55...",
  "resolved_external_address": "+551150287027",
  "resolved_from": null,
  "current_global_whatsapp_from": "whatsapp:+551150287027",
  "in_24h_window": true,
  "requires_template": false,
  "notes": "resolved_from is intentionally null in Phase 1.3A. Real From format will be defined in 1.3B after Twilio format audit."
}
```

Campos:

- `resolved_sender_sid` / `resolved_external_address`: o que o endpoint carrega.
- `resolved_from`: **sempre `null` nesta fase**. Não decidimos formato.
- `current_global_whatsapp_from`: o que `config_values.whatsapp_from` traz hoje. Permite comparar visualmente.
- `in_24h_window`, `requires_template`: derivados de `whatsapp_last_inbound_at` (read-only).

Em caso de bloqueio: mesmo envelope com `allowed: false`, `reason: '<código>'`, `resolved_from: null`. Status HTTP **200** (dry-run sempre 200; não é erro de servidor).

## 5. Auditoria pendente do `From` real (documentar, não implementar)

Adicionar comentário no topo da função registrando:

- Hoje `whatsappFrom` vem de `config_values.whatsapp_from` em formato `whatsapp:+E164` ou `whatsapp:<sender_sid>` — formato exato a confirmar com inspeção de dados de `organization_integrations`.
- Decisão sobre `From` derivado de `thread.primary_endpoint_id` fica para Fase 1.3B, após confirmar com Twilio qual formato é aceito (E164 vs Messaging Service vs sender_sid `MG…`/`XE…`).

Nada disso é executado — é só comentário de bloco para a próxima fase.

## 6. Critério de aceite (sem envio real)

Validação via `supabase--curl_edge_functions` com `dryRun: true, senderContext: 'inbox'`:

| Cenário | threadId | Esperado |
|---|---|---|
| Thread CS atual | um dos 5 (ex.: `af945caf-…`) | `allowed: true`, `warnings: ["endpoint_purpose_other"]`, `resolved_sender_sid: "XE4e6a55…"`, `resolved_external_address: "+551150287027"` |
| Thread comercial (purpose='commercial') | a localizar via query antes do teste | `allowed: false`, `reason: "purpose_blocked"` |
| Thread sem `primary_endpoint_id` | a localizar via query antes do teste | `allowed: false`, `reason: "no_endpoint"` |

Se não existir thread comercial real, criar caso negativo via `threadId` inexistente → `reason: 'missing_thread'` (registrar a limitação no resultado, não bloqueia a fase).

Nenhum envio real ao cliente. Nenhuma alteração em `/messages`. Nenhuma alteração no fluxo padrão de produção.

## 7. Fora de escopo (reafirmado)

- Composer `/inbox`
- Envio real (Inbox ou comercial de controle)
- Templates no `/inbox`
- Upload, áudio, notas internas
- RPC nova, migration, RLS, `inbox_audit_log`
- Mudança em `/messages`, `WhatsAppChat.tsx`, hooks do Inbox
- Twilio setup, Meta Cloud, qualquer outra edge function
- Fase 1.3B (definição do `From` real e ativação do composer)

---

## Detalhes técnicos do patch

**Arquivo:** `supabase/functions/twilio-whatsapp-send/index.ts` (único).

**Forma:**

```text
parse body { ..., senderContext, dryRun }

if dryRun === true:
    if senderContext !== 'inbox': return 400
    if !threadId:            return 200 { allowed:false, reason:'missing_thread' }
    load thread (org-scoped)
    if !thread.primary_endpoint_id: return 200 { allowed:false, reason:'no_endpoint', ... }
    load endpoint
    run guard() → { allowed, reason, warnings }
    compute in_24h_window from thread.whatsapp_last_inbound_at
    return 200 { dryRun:true, allowed, reason, warnings,
                 resolved_sender_sid, resolved_external_address,
                 resolved_from: null,
                 current_global_whatsapp_from,
                 in_24h_window, requires_template, notes }

# fluxo existente segue idêntico abaixo, sem qualquer alteração
```

**Logs:** prefixo `[inbox-dryrun]` apenas no branch dry-run.

**Entrega:** patch + 3 prints de `curl_edge_functions` (CS, bloqueado, sem endpoint).
