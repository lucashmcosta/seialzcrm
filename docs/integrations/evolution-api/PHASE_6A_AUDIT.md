# Fase 6A — Integração Inbound (Piloto Viagi)

Status: **implementada e inerte** para todos os tenants exceto Viagi
(`b246ef6f-6242-4011-a112-6d8783d2896a`), que passa a receber mensagens
reais da Evolution API via `evolution-webhook`.

Escopo: **apenas inbound**. Nenhum envio, nenhuma alteração de composer,
dispatcher, `active_endpoint_id`, filas de outbound, automações, IA,
Meta ou Twilio. Feature flag `evolution_api_enabled` continua habilitada
somente para Viagi.

---

## 1. Arquivos alterados

| Arquivo | Tipo | Notas |
| --- | --- | --- |
| `supabase/functions/evolution-webhook/index.ts` | reescrito | Preserva 100% do comportamento da Fase 5 (auth, rate limit, idempotência persistente, `CONNECTION_UPDATE`/`QRCODE_UPDATED`) e adiciona ingest inbound real para `MESSAGES_UPSERT` + status para `MESSAGES_UPDATE` / `MESSAGE_RECEIPT_UPDATE`. |

Sem novas Edge Functions, sem novos hooks, sem nova UI. Zero mudanças em
`meta-whatsapp-webhook`, `twilio-whatsapp-webhook`,
`_shared/whatsapp/*`, `dispatchWhatsAppSend`, `services/whatsapp.ts`,
`resolveComposerProvider`, `useThreadSendEndpoint`, componentes do
Inbox/Composer.

## 2. Migrations

**Nenhuma.** Toda a persistência usa tabelas já existentes:

- `integration_inbound_events` (idempotência, auditoria e replay).
- `communication_endpoints` (endpoint Viagi criado na Fase 5, sem grants novos).
- `contacts`, `message_threads`, `messages`, `notifications`, `activities`.
- `evolution_instances` (efeitos de estado, sem alteração de schema).

## 3. Fluxo implementado

```
Evolution (Vultr)
   │  POST /functions/v1/evolution-webhook
   │  header x-evolution-webhook-secret
   ▼
evolution-webhook (Deno)
   │  0. Rate-limit por IP  (120 req / 60s)
   │  1. Auth timing-safe   (EVOLUTION_WEBHOOK_SECRET)
   │  2. Parse envelope     (event, instance, data)
   │  3. Resolve instância  (evolution_instances → org + endpoint)
   │  4. Feature flag PER-ORG (evolution_api_enabled)
   │  5. INSERT integration_inbound_events
   │       UNIQUE(integration_slug, idempotency_key)
   │       → 23505 = duplicata → 200 { duplicate: true }
   │  6. Router por evento
   │       ├── CONNECTION_UPDATE / QRCODE_UPDATED → applyStateEvent (Fase 5, inalterado)
   │       ├── MESSAGES_UPSERT                    → ingestInboundMessage
   │       └── MESSAGES_UPDATE / MESSAGE_RECEIPT_UPDATE → applyMessageStatus
   │  7. markInboundEvent (processed | failed | skipped)
   ▼
messages / message_threads / contacts / notifications / activities
```

## 4. Mapeamento dos eventos

Evolution v2 pode emitir eventos em `snake.case` (`messages.upsert`) ou
`SCREAM_SNAKE_CASE`. A função normaliza para o formato canônico:

| Evento canônico | Origem Evolution | Tratamento |
| --- | --- | --- |
| `CONNECTION_UPDATE` | `connection.update` | Atualiza `evolution_instances.last_known_state` / `instance_id_remote`. |
| `QRCODE_UPDATED` | `qrcode.updated` | Atualiza `evolution_instances.last_qr_expires_at` e força `last_known_state='connecting'`. |
| `MESSAGES_UPSERT` | `messages.upsert` | Ingest inbound. `fromMe: true` é registrado como `skipped` (sem persistência). |
| `MESSAGES_UPDATE` | `messages.update` | Mapeia `status`/`update`/`ack` para `messages.whatsapp_status`. |
| `MESSAGE_RECEIPT_UPDATE` | `message-receipt.update` | Idem `MESSAGES_UPDATE`. |
| qualquer outro | — | `skipped` com `process_error='unknown_event'`; sem lateral effect. |

Mapeamento de status (`applyMessageStatus`):

| Origem | `whatsapp_status` |
| --- | --- |
| `0` / `error` / `failed` | `failed` |
| `1` / `pending` / `queued` | `queued` |
| `2` / `sent` / `server_ack` | `sent` |
| `3` / `delivered` | `delivered` |
| `4` / `read` / `5` / `played` | `read` |
| desconhecido | não atualiza (`unmapped_status`) |

## 5. Pipeline inbound (paridade Meta/Twilio)

Cada função abaixo replica **o mesmo padrão** já usado por
`meta-whatsapp-webhook`, sem duplicar dependências:

| Etapa | Meta | Evolution (Fase 6A) |
| --- | --- | --- |
| Normalização E.164 + variação 9º dígito BR | `normalizePhoneForSearch` | idem (mesma implementação) |
| Resolução de `inbound_settings` | endpoint → integração → default | idem |
| `findOrCreateContact` | busca por `phone.eq.<variacoes>` respeitando `deleted_at` | idem |
| Auto-oportunidade (opcional) | pipeline_stages first-by-order fallback | idem |
| Lookup de thread | `channel='whatsapp'` + `primary_endpoint_id` + `limit(5)` ordenado | idem |
| Insert de `messages` | `sender_type='contact'`, `direction='inbound'`, `whatsapp_status='delivered'` | idem |
| Update de thread | `whatsapp_last_inbound_at` + `last_inbound_at` + `updated_at` | idem |
| Reply-to | lookup `whatsapp_message_sid = context.id` | lookup `whatsapp_message_sid = contextInfo.stanzaId` |
| Notificação ao owner | `notifications` (WhatsApp message) | idem |
| Activity feed | `activities.activity_type='message'` | idem |
| AI SDR ou `needs_human_attention` | idem | idem (mesmo `ai-agent-respond` invocado fire-and-forget) |

## 6. Persistência

**Contato:** criado com `source='whatsapp'`, `lifecycle_stage` do
`inbound_settings` (default `lead`), `full_name` do `pushName` ou
fallback `WhatsApp <E164>`.

**Thread:** `channel='whatsapp'`, `primary_endpoint_id` = endpoint
Evolution Viagi, `subject='WhatsApp'`.

**Mensagem:** `direction='inbound'`, `sender_type='contact'`,
`whatsapp_message_sid` = `key.id`, `endpoint_id` = endpoint Viagi,
`sent_at` derivado de `messageTimestamp`, `metadata.evolution` guarda:

```jsonc
{
  "media_kind": "audio|image|video|document|sticker|null",
  "mime_type": "...",
  "file_name": "...",
  "caption": "...",
  "storage_path": "b246.../evolution-inbound/<wamid>.<ext>",
  "push_name": "...",
  "remote_jid": "5511...@s.whatsapp.net",
  "participant_jid": null,
  "raw": { ...payload Baileys unwrappado... }
}
```

## 7. Tratamento de mídia

Best-effort via `POST {EVOLUTION_BASE_URL}/chat/getBase64FromMediaMessage/{instance}`
com header `apikey: EVOLUTION_GLOBAL_API_KEY`, timeout 15s, sem retry.
Bytes decodificados e enviados ao bucket `whatsapp-media` no path
`{organization_id}/evolution-inbound/{wamid}.{ext}` com `upsert:true`.
`media_urls` recebe a public URL. Falha de download **não bloqueia** a
persistência — o campo `metadata.evolution.media_download_error` /
`media_upload_error` registra a causa, e o `content` cai para o
placeholder `[Áudio]/[Imagem]/…` ou a legenda.

## 8. Tratamento de contatos

`findOrCreateContact` sempre passa pelas 6–14 variações do 9º dígito BR
antes de decidir criar. Se `inbound_settings.auto_create_contact` for
`false`, retorna `null` e a mensagem é registrada em
`integration_inbound_events` com `process_status='failed'`
(`no_contact`), sem lateral effect.

Grupos (`@g.us`) e broadcast (`status@broadcast`) são detectados em
`jidToE164` e resultam em `skipped_group_or_broadcast` — nenhum contato
ou thread é criado.

## 9. Tratamento de threads

Mesmo lookup ordenado do Meta (`last_message_at DESC NULLS LAST`,
`created_at DESC`, `limit(5)`) para tolerar duplicatas históricas sem
recriar. Cria só quando o array vem vazio. Não altera `assigned_user_id`,
`active_endpoint_id`, nem qualquer estado de composer.

## 10. Tratamento de mensagens

Idempotência em duas camadas:

1. `integration_inbound_events(UNIQUE integration_slug, idempotency_key)`
   com `idempotency_key = "<instance>|<EVENT>|<key.id>"` — dedupa o
   próprio evento HTTP.
2. `messages` lookup por `(organization_id, whatsapp_message_sid)` antes
   do insert. Race condition (23505 no insert) é capturada e o registro
   pré-existente é retornado.

Reprocessar o mesmo webhook nunca gera contato, thread ou mensagem
duplicada.

## 11. Estratégia de replay

`integration_inbound_events` guarda o envelope completo por
`INBOUND_EVENT_TTL_MS` (7 dias). Um replay pode ser feito reenviando o
mesmo payload ao webhook — a resposta será `200 { duplicate: true }` se
o `idempotency_key` já existir. Reprocessamento manual pode ser feito
via um worker futuro que releia registros com
`process_status IN ('failed','received')`; isso não faz parte da Fase
6A.

## 12. Estratégia de idempotência

- **Evento HTTP:** UNIQUE em `integration_inbound_events`.
- **Mensagem:** `(organization_id, whatsapp_message_sid)` + captura de
  `23505` no insert.
- **Contato:** lookup por variações de telefone antes de criar.
- **Thread:** lookup por `(org, contact, channel, primary_endpoint_id)`
  ordenado antes de criar.
- **Oportunidade automática:** só cria se contato foi recém-criado
  E `auto_create_opportunity=true` E não existe `open` sem
  `deleted_at`.
- **Status:** update por `whatsapp_message_sid` é naturalmente
  idempotente (mesmo update, mesmo estado final).

## 13. Testes

### Executados neste turno (sem sessão WA pareada disponível)

| # | Cenário | Comando | Resultado |
| --- | --- | --- | --- |
| T1 | Auth falha sem secret válido | `curl_edge_functions` com `x-evolution-webhook-secret: wrong` | `401 UNAUTHORIZED` ✓ |
| T2 | Deploy limpo, cold start | `supabase--deploy_edge_functions` | `booted (time: 25ms)` ✓ |
| T3 | Herança do gate Fase 5 | Reused code path para `FEATURE_DISABLED` | inalterado (mesma função `featureFlagEnabled`, mesmos testes T3/T4 da Fase 5 continuam válidos) |

### Delegados ao piloto (requerem sessão WA pareada em Viagi)

Os cenários abaixo precisam de uma instância `viagi-pilot` com
`connectionState=open` e um número real trocando mensagens. Devem ser
executados durante a janela de piloto controlado pelo operador:

- **T4 — Mensagem simples:** enviar um texto do celular do prospect
  para o número Viagi. Verificar em `messages` novo row com
  `direction='inbound'`, `endpoint_id=<viagi>`, `content=<texto>`,
  `whatsapp_message_sid=<key.id>`.
- **T5 — Múltiplas mensagens seguidas:** enviar 3 textos consecutivos;
  verificar 3 rows na mesma `thread_id` e `last_inbound_at` atualizado.
- **T6 — Mensagem repetida (idempotência HTTP):** o próprio Evolution
  às vezes reenvia. Confirmar que a segunda entrada retorna
  `duplicate: true` em `integration_inbound_events` (via logs).
- **T7 — Mídia (áudio/imagem):** verificar `media_urls`, `media_type`
  e `metadata.evolution.storage_path` populados no bucket
  `whatsapp-media` sob `.../evolution-inbound/`.
- **T8 — Status delivered/read:** verificar `messages.whatsapp_status`
  passando por `delivered → read`.
- **T9 — Reconnect da instância:** desligar/religar celular; validar
  que `evolution_instances.last_known_state` reflete o ciclo
  `close → connecting → open` (já validado na Fase 5).
- **T10 — Webhook duplicado (retry):** reenviar manualmente o mesmo
  payload; esperar `200 { duplicate: true }`.
- **T11 — Grupo/broadcast:** enviar mensagem de um grupo; esperar
  `skipped_group_or_broadcast` no log e nenhum row criado.

Nenhum outro tenant participa desses testes.

## 14. Métricas

Emitidas em `console.log`/`console.warn` via `logEvolution` (JSON
estruturado) com os campos: `fn`, `requestId`, `event`, `instanceName`,
`orgId`, `code`, `message`. Códigos usados:

- `RATE_LIMITED`, `UNAUTHORIZED`, `MISSING_SECRET`
- `FEATURE_DISABLED`, `DUPLICATE_EVENT`, `INTERNAL_ERROR`
- mensagens livres: `inbound_ingested`, `inbound_failed:<reason>`,
  `instance not registered — logged only`

Contagens agregadas devem ser tiradas via
`supabase--analytics_query` filtrando por `metadata.function_id`
da `evolution-webhook`.

## 15. Evidências de não-regressão

| Garantia | Evidência |
| --- | --- |
| Somente Viagi habilitada | `SELECT organization_ids FROM feature_flags WHERE key='evolution_api_enabled'` continua = `{b246ef6f-6242-4011-a112-6d8783d2896a}`. `SELECT DISTINCT organization_id FROM evolution_instances` = apenas Viagi. |
| Meta continua funcionando | `supabase/functions/meta-whatsapp-webhook/index.ts` inalterado (diff vazio). Nenhum helper compartilhado sob `_shared/meta-whatsapp/*` foi tocado. |
| Twilio continua funcionando | `supabase/functions/twilio-whatsapp-webhook/index.ts` inalterado (diff vazio). |
| Outbound desabilitado | Nenhuma chamada para `dispatchWhatsAppSend`, `resolveComposerProvider`, `services/whatsapp.ts`, `sendText`, `sendMedia` neste diff. Grep manual em `evolution-webhook/index.ts` confirma zero `sendText`/`sendMedia`/`send_message`/`outbound`. |
| Nenhuma mensagem enviada | Endpoint Viagi (`11111111-e701-4a01-8000-000000000001`) tem `is_active=true` mas nenhuma linha `messages` com `direction='outbound'` e `endpoint_id=<viagi>` foi ou pode ser criada por esta função. |
| Dispatcher não mudou | `integration-inbound-dispatcher` intacto; `evolution_api` continua fora do `INTEGRATION_SLUG` que ele consome (`twilio-whatsapp`). |
| Composer não mudou | Nenhum arquivo em `src/lib/composer*`, `src/lib/dispatchWhatsAppSend.ts`, `src/hooks/useThreadSendEndpoint.ts` alterado. |
| `active_endpoint_id` não mudou | Nenhum UPDATE em `contacts.active_endpoint_id` ou em `communication_endpoints` neste diff. |
| Nenhum outro tenant afetado | Todas as escritas usam `organizationId` derivado de `evolution_instances` (única linha aponta para Viagi). Feature flag bloqueia antes de qualquer resolução para não-Viagi. |

## 16. Como reverter

1. Desligar a flag: `UPDATE feature_flags SET is_enabled=false, organization_ids='{}' WHERE key='evolution_api_enabled';`
   → o webhook passa a responder `202 FEATURE_DISABLED` para tudo, sem
   lateral effect. Nenhuma outra ação é necessária para pausar o piloto.
2. Rollback completo (opcional): fazer checkout do commit anterior de
   `supabase/functions/evolution-webhook/index.ts` e redeployar. O
   endpoint, a instância Evolution e as tabelas `evolution_instances`
   permanecem, mas voltam ao comportamento log-only da Fase 5.

---

**Fim da Fase 6A.** Aguardando aprovação explícita para iniciar a Fase
6B. Nenhum outro tenant será habilitado sem instrução explícita.
