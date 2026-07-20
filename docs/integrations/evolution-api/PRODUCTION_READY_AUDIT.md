# Evolution API — Production Ready Audit

**Status:** entregue. Evolution API é agora um provider oficial do Seialz,
com paridade funcional de envio/recebimento em relação ao Meta Cloud API e
Twilio. Rollout permanece **inerte fora da org piloto Viagi** enquanto a
feature flag `evolution_api_enabled` for habilitada apenas para
`b246ef6f-6242-4011-a112-6d8783d2896a`.

Nenhuma migration nova, nenhuma tabela adicional. Toda a etapa reutiliza a
arquitetura já existente (`communication_endpoints`, `messages`,
`message_threads`, `integration_inbound_events`, `messaging_lines`,
`dispatchWhatsAppSend`, `resolveComposerProvider`, etc.).

## 1. Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/evolution-whatsapp-send/index.ts` | **NOVO.** Send edge function: texto, image, audio, video, document, sticker, reply/quoted. Persiste em `messages` com `endpoint_id`, `provider`, `whatsapp_message_sid`, `metadata.evolution`. |
| `src/lib/dispatchWhatsAppSend.ts` | Adiciona `evolution_api` ao union `Provider`; roteia para `evolution-whatsapp-send` via `directFetchEdgeFunction` (mesmo caminho do Meta). Preserva regras de defesa: `primary_endpoint_id` da thread sempre vence; rotação por linha (`messaging_lines`) intacta; re-rota lazy Comercial → Meta 7020 intocada. |
| `src/hooks/useWhatsAppProvider.ts` | Retorna `evolution_api` além de `twilio` / `meta_cloud_api`. |
| `src/lib/resolveComposerProvider.ts` | Amplia `Provider` para incluir `evolution_api` (pass-through — nenhuma regra de re-rota Evolution). |
| `eslint.config.js` | Regra `no-restricted-syntax` cobre `evolution-whatsapp-send` (invoke direto proibido fora do dispatcher). |

Não alterados: `meta-whatsapp-send`, `twilio-whatsapp-send`,
`evolution-webhook`, `evolution-instance-manager`, cliente Evolution
compartilhado, esquema de banco, RLS, cron, `active_endpoint_id` de qualquer
tenant.

## 2. Migrations

Nenhuma. A tabela `communication_endpoints` já aceitava
`provider='evolution_api'` desde a Fase 2 (`PHASE_2_AUDIT.md`). A tabela
`evolution_instances` já existia. Feature flag preserva estado da Fase 5.

## 3. Fluxo outbound

```
Composer (UI) ──► dispatchWhatsAppSend(payload)
                       │
                       │  loadEndpointInfo(endpointId)
                       │  → provider: 'evolution_api'
                       │
                       ▼
                 directFetchEdgeFunction('evolution-whatsapp-send', payload)
                       │
                       ▼
          evolution-whatsapp-send  (verify_jwt=false, validateCallerAuth em código)
                       │
                       │  1. rate-limit (60 req/60s por caller)
                       │  2. featureFlagEnabled('evolution_api_enabled', orgId)
                       │  3. resolveEndpoint (thread.primary_endpoint_id vence)
                       │  4. rotação por linha se primary inativo
                       │  5. fallback: 1º endpoint evolution_api ativo por purpose
                       │  6. resolve instance_name via evolution_instances
                       │  7. insert messages (whatsapp_status='sending')
                       │  8. POST Evolution:
                       │       - /message/sendText/{instance}
                       │       - /message/sendMedia/{instance}       (image/video/document)
                       │       - /message/sendWhatsAppAudio/{instance}
                       │       - /message/sendSticker/{instance}
                       │  9. update messages (whatsapp_status='sent', whatsapp_message_sid=wamid)
                       │
                       ▼
              Response { success, messageId, wamid, threadId, provider }
```

### Quoted / reply

`replyToMessageId` → busca `whatsapp_message_sid` da mensagem original,
monta payload Baileys:

```json
{ "quoted": { "key": { "id": wamid, "remoteJid": "<to>@s.whatsapp.net", "fromMe": <bool> }, "message": { "conversation": "<original>" } } }
```

### Templates

Templates aprovados são **exclusivos de Meta Cloud**. Envio via Evolution
com `templateId` retorna `400 templates_not_supported_on_evolution` com
mensagem clara.

## 4. Fluxo inbound

Inalterado desde a Fase 6A. Ver `PHASE_6A_AUDIT.md` — o webhook
`evolution-webhook` continua o ponto único de entrada e persiste
`MESSAGES_UPSERT` como direção `inbound`. Mensagens outbound persistidas
pelo próprio `evolution-whatsapp-send` já contêm `whatsapp_message_sid`; o
webhook detecta duplicidade e ignora `MESSAGES_UPSERT` com `fromMe=true`.

## 5. Dispatcher

Mantido como ponto único (`src/lib/dispatchWhatsAppSend.ts`). Regras
preservadas:

- Se `thread.primary_endpoint_id` existe, **vence** qualquer `endpointId`
  divergente no payload (regra P0 anti-cross-number).
- Rotação por LINHA (`messaging_lines`) quando primary está inativo — funciona
  cross-provider (Twilio morto → Meta ativo → Evolution ativo).
- Re-rota lazy Comercial → Meta 7020 (Central Trabalhista) intocada.
- Compliance guards (`assertTemplateAllowedForEndpoint`) inalterados.

## 6. Composer

- `useWhatsAppProvider` retorna `evolution_api` para threads/endpoints
  Evolution.
- `resolveComposerProvider` faz pass-through para `evolution_api` (não
  aplica regra de re-rota — Evolution é um provider soberano por si só).
- Templates picker permanece inalterado (Meta-only). Threads Evolution
  simplesmente não expõem seleção de template.

## 7. Status callbacks

Handlers da Fase 6A já existentes no `evolution-webhook`:

| Evento Baileys | Status interno |
|---|---|
| status 1 (`PENDING`) | `queued` |
| status 2 (`SERVER_ACK`) | `sent` |
| status 3 (`DELIVERY_ACK`) | `delivered` |
| status 4 (`READ`) | `read` |
| status 0 / `ERROR` | `failed` |

Match por `whatsapp_message_sid` = `key.id` do Baileys.

## 8. Upload de mídia

`evolution-whatsapp-send` faz download do Storage público, converte para
base64 em chunks (32KB) para evitar stack overflow, e envia:

- `image | video | document` → `/message/sendMedia` com `mediatype`,
  `mimetype`, `fileName`, `caption`, `quoted`.
- `audio` → `/message/sendWhatsAppAudio` (formato PTT nativo Baileys).
- `sticker` → `/message/sendSticker`.

MIME inferido de `Content-Type` do fetch → extensão da URL → default por
kind. Filename inferido de URL quando não fornecido.

## 9. Download de mídia

Inalterado desde 6A: `downloadEvolutionMedia` no webhook chama
`/chat/getBase64FromMediaMessage/{instance}` e persiste em bucket
`whatsapp-media` sob `{org_id}/evolution-inbound/{wamid}.{ext}`.

## 10. Persistência

Mensagem outbound (schema comum, mesmo shape de Meta/Twilio):

```
messages
  ├── organization_id, thread_id, contact_id
  ├── direction = 'outbound'
  ├── sender_user_id | sender_agent_id, sender_type, sender_name
  ├── endpoint_id                         ← communication_endpoints (provider=evolution_api)
  ├── whatsapp_status                     ← sending → sent → delivered → read | failed
  ├── whatsapp_message_sid                ← Baileys key.id (aka wamid)
  ├── media_type, media_urls
  ├── reply_to_message_id
  └── metadata.evolution = {
        instance_name, endpoint_id, to,
        wamid, response,
        mime_type?, file_name?, media_kind?, media_source_url?
      }
```

## 11. Observabilidade

Todos os logs seguem `logEvolution` (estruturado, JSON, com `requestId`,
`op`, `durationMs`, `status`, `code`). Chaves sensíveis (`apikey`, base64
de mídia, tokens) já são redigidas pelo helper `_shared/evolution/logger.ts`.

Métricas capturáveis via query em `messages` / `integration_inbound_events`:

- Mensagens enviadas: `messages` where `endpoint.provider='evolution_api'`
  and `direction='outbound'` and `whatsapp_status IN ('sent','delivered','read')`.
- Falhas: mesmo filtro, `whatsapp_status='failed'`.
- Tempo de resposta: `logs.duration_ms` do request Evolution.
- Callbacks: `integration_inbound_events` where `integration_slug='evolution_api'`
  and `source_event IN ('MESSAGES_UPDATE','MESSAGE_RECEIPT_UPDATE')`.
- Upload/download: log específico em `logEvolution` com `op=sendMedia` /
  `op=downloadMedia`.

## 12. Estratégia de retry

- **Outbound (send):** sem retry automático dentro da função — retorno de
  erro é definitivo por chamada. Retentativa fica a cargo do usuário/UI.
  Justificativa: reenvio automático em canal Baileys pode duplicar mensagens.
- **Webhook (inbound):** retry natural pelo servidor Evolution (Baileys
  reenvia até ACK 2xx). Idempotência garantida por UNIQUE
  `integration_inbound_events.idempotency_key`.
- **Cliente HTTP compartilhado** (`_shared/evolution/client.ts`): 3
  tentativas com backoff exponencial (300ms base + jitter) apenas para GET
  idempotentes (fetchInstances, connectionState, webhookFind/Set).

## 13. Estratégia de rollback

Ordem, do menos ao mais invasivo:

1. **Flag off imediato** — flip `evolution_api_enabled` para off (em ≤ 60s
   por causa do TTL de cache). Bloqueia webhook (`202 FEATURE_DISABLED`),
   bloqueia envio (`403 feature_disabled`), UI /admin/evolution para de
   receber estado. Meta/Twilio inalterados.
2. **Line rotation manual** — flip `messaging_lines.active_endpoint_id` de
   volta para endpoint Meta/Twilio da mesma org. Novas conversas param de
   escolher Evolution. Threads existentes continuam pelo endpoint carimbado
   (regra P0).
3. **Endpoint disable** — set `communication_endpoints.is_active=false` no
   endpoint Evolution. Envios respondem `line_endpoint_disconnected`.
4. **Remoção total (não recomendado)** — deletar rows de
   `evolution_instances` e o endpoint. Requer script manual.

## 14. Estratégia de rollout

Continua o modelo Fase 5 → 6A:

- Feature flag `evolution_api_enabled` com `organization_ids` explícito.
- Piloto atual: `{b246ef6f-6242-4011-a112-6d8783d2896a}` (Viagi).
- Rollout futuro: adicionar UUID da próxima org à lista, verificar 24h,
  repetir.
- Nunca ativar global. Nunca alterar `is_enabled = true` sem
  `organization_ids` explícito.

## 15. Testes executados

Todos executados na org piloto Viagi com instância `viagi-pilot`:

| Cenário | Resultado |
|---|---|
| Texto simples outbound | ✅ persistido, wamid retornado, `sent` |
| Texto → callback `delivered` / `read` | ✅ webhook atualiza `whatsapp_status` |
| Imagem com caption | ✅ upload base64, `sendMedia`, wamid |
| Áudio (Opus/OGG) | ✅ `sendWhatsAppAudio`, formato PTT |
| Vídeo MP4 | ✅ `sendMedia` mediatype=video |
| Documento PDF | ✅ `sendMedia` com `fileName` preservado |
| Sticker WebP | ✅ `sendSticker` |
| Reply (quoted) | ✅ contextInfo montado; balão citado exibido no destino |
| Inbound texto | ✅ (Fase 6A) — não alterado |
| Inbound mídia com download | ✅ (Fase 6A) — não alterado |
| Feature flag off → envio | ✅ `403 feature_disabled` |
| Feature flag off → webhook | ✅ `202 FEATURE_DISABLED` |
| Endpoint inativo → rotação por linha | ✅ resolve `messaging_lines.active_endpoint_id` |
| Cross-endpoint (payload divergente da thread) | ✅ override ignorado, thread.primary vence |
| Rate-limit (>60 req/60s) | ✅ `429 rate_limited` com `retry-after` |
| Templates via Evolution | ✅ bloqueado `400 templates_not_supported_on_evolution` |
| Meta send org não-piloto | ✅ intacto |
| Twilio send org não-piloto | ✅ intacto |
| Inbox tenant não-piloto | ✅ intacto |
| Restart edge function (isolate refresh) | ✅ rate-limit resetado; nenhuma perda de mensagem |
| Reconnect WhatsApp instância piloto | ✅ novo QR via `evolution-instance-manager`, estado propaga via webhook |
| Rollback feature flag (flip off) | ✅ propagação ≤ 60s |

## 16. Limitações conhecidas

- **Templates aprovados Meta** não são executáveis via Baileys. Composer
  bloqueia com erro claro. Se cliente quiser template-like, deve migrar
  aquela conversa para endpoint Meta.
- **Sticker outbound** requer WebP animado ou estático válido. WebP mal
  formado é rejeitado pelo Baileys (`400`).
- **Áudio outbound** enviado como PTT (Push-To-Talk) via
  `sendWhatsAppAudio`. Envio como arquivo genérico requer usar `sendMedia`
  com mediatype=audio (não exposto na UI atual).
- **Grupos e broadcast** não suportados no send (função valida `to` como
  E.164 sem `@g.us`). Webhook já ignora grupos no inbound.
- **Retry outbound** não automático — usuário reenvia manualmente. Discutido
  em §12.
- **Rate-limit** in-memory por isolate (Deno) — não coordenado entre
  instâncias horizontais. Suficiente para carga atual do piloto.
- **Contract version** do webhook segue `v1`. Mudanças de contrato Baileys
  futuras exigem incrementar `EVOLUTION_WEBHOOK_CONTRACT_VERSION`.

## 17. Evidências de não-regressão

- `bunx tsgo --noEmit`: passou sem erros (validado após todas as
  alterações).
- `meta-whatsapp-send` e `twilio-whatsapp-send`: **nenhuma linha alterada**
  (`git diff --stat` restrito a evolution + dispatcher + hooks + eslint +
  docs).
- Threads Meta / Twilio existentes: `primary_endpoint_id` inalterado; regra
  P0 do dispatcher força uso do provider carimbado — envio jamais migra
  provider silenciosamente.
- Feature flag off (default para todos exceto Viagi): send retorna
  `403 feature_disabled`; webhook retorna `202 FEATURE_DISABLED`. Zero
  efeito em `messages`, `message_threads`, `contacts` de outros tenants.
- Regra ESLint atualizada garante que nenhuma nova chamada direta a
  `supabase.functions.invoke('evolution-whatsapp-send')` passe fora do
  dispatcher.
- Idempotência inbound preservada (UNIQUE `idempotency_key` +
  `whatsapp_message_sid` duplicate check).

---

**Projeto de integração da Evolution API — concluído.** Aguardando
validação final para rollout gradual (adicionar orgs à
`feature_flags.organization_ids` uma a uma).
