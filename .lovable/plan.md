
## Correção segura do roteamento outbound (Meta Cloud × Twilio)

### Auditoria — resultado

**Pontos que enviam WhatsApp outbound:**

| Caminho | Arquivo | Usa dispatcher? |
|---|---|---|
| `/messages` desktop | `src/pages/messages/MessagesList.tsx` (3 sites) | ✅ |
| `/messages` mobile | `src/components/mobile/MobileMessagesList.tsx` (3 sites) | ✅ |
| `/inbox` | `src/components/inbox/InboxComposer.tsx` | ✅ |
| Contact detail | `src/components/contacts/ContactMessages.tsx` (2 sites) | ✅ |
| Chat legado | `src/components/whatsapp/WhatsAppChat.tsx` (2 sites) | ✅ |
| AI Agent | `supabase/functions/ai-agent-respond/index.ts` (2 sites) | ✅ (servidor) |
| Scheduled cron | `supabase/functions/scheduled-messages-cron/index.ts` | ✅ (servidor) |
| Meta Lead Ads | `supabase/functions/meta-lead-ads-process-lead/index.ts` | ✅ (servidor) |
| Backfill CT | `supabase/functions/ct-backfill-once/index.ts` | ✅ (servidor) |
| ApiDocs | `src/pages/docs/ApiDocs.tsx` | doc estática, não envia |

**Sem worker Railway / sem trigger Postgres outbound.** Verificado: `pg_triggers` em `public.messages` = 0. Nenhum dispatcher externo. Hoje, 100% dos envios reais passam por `dispatchWhatsAppSend` → edge function.

**Por que então a mensagem da Tamires saiu por Twilio?** Duas brechas no caminho atual:

1. `dispatchWhatsAppSend` (cliente e servidor) tem **fallback silencioso**: se a query em `communication_endpoints` retornar `null` (RLS, linha removida, rede), assume `twilio`. Linhas 38-50 / 53-68 em ambos os arquivos.
2. `twilio-whatsapp-send` no path `inbox` (linhas 282-403) resolve `endpoint` mas **nunca checa `endpoint.provider`**. Se a thread aponta para endpoint Meta, ele constrói `whatsapp:+<external_address>` (que pertence à Meta), submete ao Twilio e recebe `63007`. Foi exatamente isso na mensagem `eb83c428…`: `endpoint_id=407ff93d` (Meta) registrado, `metadata.twilio.From=whatsapp:+551150287020`.

### Mudanças

#### 1. `supabase/functions/twilio-whatsapp-send/index.ts` — guard hard

Em **todos** os blocos onde o endpoint é resolvido (inbox path + default `messages` path), depois de ler a linha de `communication_endpoints`:

```ts
if (endpoint.provider === 'meta_cloud_api') {
  console.error('[twilio-send] BLOCKED meta_cloud_api endpoint reached twilio-send', {
    threadId, endpointId: endpoint.id, external_address: endpoint.external_address,
  });
  return jsonError(400, 'wrong_provider_for_endpoint', {
    expected: 'twilio', actual: 'meta_cloud_api', endpoint_id: endpoint.id,
  });
}
```

Idem no path `messages` (legacy): carregar `endpoint.provider` antes de montar `From` e aplicar mesmo guard. Nenhuma escrita em `messages` antes do guard — falha limpa, sem deixar `metadata.twilio` órfão.

#### 2. `src/lib/dispatchWhatsAppSend.ts` + `supabase/functions/_shared/dispatch-whatsapp-send.ts` — fail-closed

Reescrever `resolveProvider` para retornar `{ provider, source }` e nunca cair em `twilio` por omissão:

- `endpointId` passado:
  - row encontrada → retorna `provider` real.
  - row ausente → **lança erro** `unknown_endpoint`.
- senão `threadId`:
  - thread tem `primary_endpoint_id` → carrega endpoint; ausente = erro `endpoint_missing`.
  - thread sem `primary_endpoint_id` → **fallback explícito** olhando a última `messages.endpoint_id` da thread (mesma lógica que o twilio-whatsapp-send já faz). Se achar Meta, retorna Meta.
  - nada disso → mantém default `twilio` (comportamento atual de threads legadas Twilio).
- `dispatchWhatsAppSend` propaga o erro como `{ data:null, error:{ message } }`, sem invocar nenhuma função.

Adicionar log estruturado `[dispatch-wa] route` com `{ provider, source, endpointId, threadId }` em cada chamada — para auditoria futura.

#### 3. Validação no lead tcharlesmattos2

Sem alterar dado real do usuário:

- Texto curto pela Tamires → esperar resposta `meta-whatsapp-send`, linha em `messages` com `metadata.meta_cloud.raw.*`, sem `metadata.twilio`.
- Áudio pela Tamires → idem.
- Smoke em thread Twilio (`Mara` no endpoint c09bd713) → texto sai via Twilio, comportamento inalterado.
- Tentativa forçada `endpointId=407ff93d` chamando `twilio-whatsapp-send` direto via `curl_edge_functions` → deve retornar `wrong_provider_for_endpoint`.

#### 4. Fora de escopo (não toco)

- `meta-whatsapp-send`, templates Meta/Twilio, mídia, `handleStatus`.
- Webhooks inbound (Twilio e Meta).
- Schema / migrations.

### Detalhes técnicos

- Diff esperado: ~+60 linhas em `twilio-whatsapp-send/index.ts` (dois guards + select de `provider`), ~+30 linhas em cada dispatcher (cliente + servidor).
- Nenhum secret novo.
- Nenhuma alteração em UI.
- Logs: `[twilio-send] BLOCKED meta_cloud_api endpoint reached twilio-send` e `[dispatch-wa] route` para auditoria.

Ao aprovar, executo as 3 mudanças em sequência, faço deploy de `twilio-whatsapp-send` e rodo a validação no tcharlesmattos2 + smoke em thread Twilio.
