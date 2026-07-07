# MOBILE_MESSAGES — Módulo de Mensagens / Conversas (WhatsApp) no app mobile

Documento único de referência para portar o módulo de mensagens do web para o mobile.
Baseado em código real (não suposição). Datado 2026-07-07.

Fontes principais lidas:
- `src/lib/dispatchWhatsAppSend.ts`, `src/lib/serviceWindow.ts`, `src/lib/inboxMediaUpload.ts`
- `src/hooks/useMessageThreads.ts`, `src/hooks/inbox/*`, `src/hooks/contacts/useContactConversationsByContext.ts`
- `src/pages/messages/MessagesList.tsx`, `src/components/messages/*`, `src/components/mobile/MobileMessagesList.tsx`
- `supabase/functions/{meta,twilio}-whatsapp-{send,webhook,templates*}`, `twilio-media-proxy`
- Schema PG (`information_schema.columns`, `pg_policies`, `pg_publication_tables`), buckets `storage.buckets`
- `docs/modules/messages/*`, `docs/modules/inbox/*`, `docs/product/channel-boundaries.md`, `docs/architecture/event-flow.md`

---

## 1. Canais suportados

Hoje o módulo é **WhatsApp-only na prática**, mas o schema é multi-canal por design.

- `message_threads.channel` (text, sem enum) e `messages` herdam a thread. Valor único em uso hoje: `'whatsapp'`. `useMessageThreads` filtra por default `channels: ['whatsapp']`.
- Existe `communication_endpoints.channel` (text) e `communication_endpoints.provider` (`'twilio' | 'meta_cloud_api'`, default `'twilio'`). Toda coisa que sai/entra passa por um `communication_endpoints` — é ele que carrega provider, número/SID e propósito.
- Não há tabelas separadas para SMS/Instagram/email. Se um dia entrarem, entram na mesma dupla `message_threads` + `messages`, mudando só `channel`, `provider` e o webhook de origem.
- Duas superfícies de UI compartilham as **mesmas tabelas**: `/messages` (comercial, `business_context='sales'`) e `/inbox` (atendimento, `business_context='customer_service'`). Regra em `docs/product/channel-boundaries.md`. Para mobile: começar por `/messages` (comercial) — que é o que a aba "Conversas" do contato mostra.

**Regra:** no mobile filtre sempre `channel = 'whatsapp'` e `deleted_at IS NULL`. Não invente enum próprio de canal.

---

## 2. Schema completo

### 2.1 `public.message_threads` (36 colunas)

Chaves de negócio destacadas:

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | uuid | NO | PK |
| `organization_id` | uuid | NO | Tenant |
| `contact_id` | uuid | NO | FK `contacts.id` |
| `opportunity_id` | uuid | YES | Oportunidade vinculada (opcional) |
| `channel` | text | YES | Hoje sempre `whatsapp` |
| `status` | text | NO | `open` \| `resolved` \| `waiting` \| `snoozed` (ver [`docs/modules/inbox/*`] — SLA) |
| `business_context` | text | YES | `sales` \| `customer_service` \| `other` — separa `/messages` de `/inbox` |
| `primary_endpoint_id` | uuid | YES | FK `communication_endpoints.id` — endpoint que "possui" a thread (regra dura anti cross-number: reply DEVE usar esse endpoint) |
| `assigned_user_id` | uuid | YES | Atendente/vendedor atual |
| `assigned_at` | timestamptz | YES | |
| `original_owner_user_id` | uuid | YES | Primeiro dono (round-robin) |
| `last_message_id` | uuid | YES | Denormalizado por trigger `trg_update_thread_last_message` |
| `last_message_at` | timestamptz | YES | Denormalizado |
| `last_message_content` | text | YES | Denormalizado |
| `last_message_direction` | text | YES | `inbound` \| `outbound` \| `internal` |
| `last_inbound_at` | timestamptz | YES | **Âncora da janela 24h** |
| `whatsapp_last_inbound_at` | timestamptz | YES | Legado (usar `last_inbound_at`) |
| `needs_human_attention` | boolean | YES | Handoff da IA para humano |
| `agent_typing` / `agent_typing_at` | bool / tz | YES | Indicador de "IA digitando" |
| `awaiting_button_response` / `button_options` | bool / jsonb | YES | Quick-replies pendentes |
| `resolved_at` / `first_human_response_at` / `first_response_at` | tz | YES | SLA |
| `sla_first_response_target_at` / `sla_resolution_target_at` | tz | YES | Metas SLA |
| `waiting_started_at` | tz | YES | |
| `priority` | text | NO | `low` \| `normal` \| `high` \| `urgent` |
| `category_id` | uuid | YES | FK `support_categories.id` (só CS) |
| `last_routing_decision` | jsonb | YES | |
| `merged_into_thread_id` | uuid | YES | Se a thread foi mesclada em outra |
| `external_id`, `subject` | text | YES | |
| `created_at`, `updated_at` | tz | YES | |

Uma thread por `(contact_id, channel, primary_endpoint_id)` — na prática, um contato pode ter mais de uma thread se falar em números diferentes. Regra determinística para escolher a "representativa" numa aba do contato: ver `useContactConversationsByContext.ts`.

**RLS**: `SELECT` = admin OR `organization_id = ANY(current_user_org_ids())` AND (`user_can_view_all(org,'threads')` OR `assigned_user_id = current_user_id()` OR (não atribuída AND `user_has_cs_permission(org,'can_manage_cs_queue')`)). **Sim, existe regra "só vejo minhas atribuídas"** para quem não tem `view_all` de threads.

### 2.2 `public.messages` (32 colunas)

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant |
| `thread_id` | uuid | FK `message_threads.id` |
| `sender_user_id` | uuid | Quem enviou (outbound humano). Null em inbound e mensagens de IA. |
| `sender_type` | text | `user` \| `agent` \| `contact` \| `system` |
| `sender_name` | text | Cache do nome exibível |
| `sender_agent_id` | uuid | FK `ai_agents.id` quando IA |
| `endpoint_id` | uuid | FK `communication_endpoints.id` — qual número enviou/recebeu |
| `direction` | text | `inbound` \| `outbound` \| `internal` (nota interna) |
| `content` | text | Corpo (texto). Sanitizado por trigger `trigger_sanitize_agent_message` |
| `media_type` | text | `text` \| `image` \| `audio` \| `video` \| `document` \| `sticker` \| `template` |
| `media_urls` | jsonb | Array de URLs (pública `whatsapp-media` OU proxied Twilio) |
| `whatsapp_message_sid` | text | SID Twilio ou message_id Meta |
| `whatsapp_status` | text | `queued` \| `sent` \| `delivered` \| `read` \| `failed` \| `pending` |
| `template_id` | uuid | FK `whatsapp_templates.id` quando template |
| `reply_to_message_id` | uuid | Quote/reply nativo |
| `error_code` / `error_message` | text | Falha do provider |
| `is_internal_note` | boolean | Nota interna (não sai por WhatsApp) |
| `ai_processed`, `ai_analyzed_at`, `ai_analysis_version` | bool/tz/text | |
| `sentiment`, `intent`, `urgency_score` | text/text/int | Populados por `analyze-message` |
| `response_time_seconds` | int | Calculado por trigger para SLA |
| `metadata` | jsonb | Livre (buttons, referral CTWA, etc.) |
| `merged_from_thread_id` | uuid | Se veio de merge |
| `sent_at` | tz | Momento efetivo no provider |
| `created_at` | tz | Momento no DB |
| `is_sample` | bool | Dado de demo |
| `deleted_at` | tz | Soft delete — **sempre filtrar `deleted_at IS NULL`** |

**RLS**: `SELECT/UPDATE/DELETE` = `organization_id = ANY(current_user_org_ids())`. `INSERT` = livre (protegido por trigger de validação + edge functions). Isto é, o usuário vê **todas** as mensagens da org — o gate de "só minhas" é feito em `message_threads`, não em `messages`.

**Realtime**: `messages` e `message_threads` estão em `supabase_realtime` (confirmado em `pg_publication_tables`). `notifications` também. `message_thread_reads` **não** está.

### 2.3 `public.message_thread_reads` (unread por usuário)

Só 3 colunas: `thread_id`, `user_id`, `last_read_at`. PK composta (thread_id, user_id). RLS restringe cada usuário ao seu próprio row. Não está no realtime — atualize localmente após marcar como lida.

### 2.4 `public.communication_endpoints` (número/canal remetente)

Campos relevantes para mobile:
`id`, `organization_id`, `organization_integration_id`, `channel` (`whatsapp`), `provider` (`twilio` \| `meta_cloud_api`), `external_address` (E.164 ou `whatsapp:+…`), `sender_sid`, `external_account_id`, `display_name`, `status` (`online` \| `offline` \| `unknown` — usado para priorizar sender online), `is_active`, `purpose` (`commercial` \| `customer_service` \| `vendor_personal` \| `support` \| `other`), `assigned_user_id` (vendor_personal), `default_context_type`, `coexistence_enabled`, `quality_rating`, `current_tier`, `metadata` (jsonb).

### 2.5 `public.whatsapp_templates` (25 col)

`id`, `organization_id`, `organization_integration_id`, `provider` (`twilio`\|`meta_cloud_api`), `twilio_content_sid`, `meta_template_name`, `meta_waba_id`, `friendly_name`, `language`, `template_type`, `category`, `status` (`approved`, `pending`, `rejected`, etc. — mapeamento Twilio↔Meta em `useWhatsAppTemplates`), `rejection_reason`, `body`, `header`, `footer`, `variables` (jsonb — array de placeholders `{{1}}`, `{{2}}`), `components` (jsonb — buttons/quick-replies Meta), `allowed_purposes` (text[] — filtro por endpoint), `is_active`, `last_synced_at`, `source`, `metadata`. RLS: qualquer membro ativo da org lê/escreve.

### 2.6 `public.attachments` / `public.audio_transcriptions`

`attachments` (13 col): storage genérico com `entity_type`/`entity_id`, `bucket` (default `attachments`), `storage_path`, `file_name`, `mime_type`, `size_bytes`, `uploaded_by_user_id`, `deleted_at`. Uso em mensagens é opcional — o caminho **default hoje** é gravar a URL diretamente em `messages.media_urls`, não criar `attachments`.

`audio_transcriptions` (9 col): 1:1 com `messages.id` (mensagem de áudio). Preenchida pela edge function `transcribe-audio`. Campos: `transcript`, `language`, `provider`, `version`, `raw_response`.

### 2.7 `public.scheduled_messages`

Envio agendado (`scheduled_at`, `status`, `retry_count`, `reason`). **Aviso do docs/STATUS**: edge function `scheduled-messages-cron` existe mas o cron pg não está registrado (drift #3). Não usar no mobile como se fosse confiável até o cron ser reativado.

### 2.8 `public.notifications`

Genérica: `type` (`new_message`, `whatsapp_message`, `handoff`, etc.), `user_id`, `entity_type`/`entity_id` (aponta pra `messages.id` ou `message_threads.id`), `read_at`. Está no realtime — dá pra usar como fonte de push in-app.

---

## 3. Envio outbound

### 3.1 Ponto de entrada único — `dispatchWhatsAppSend`

**Todo envio WhatsApp passa por `src/lib/dispatchWhatsAppSend.ts`.** Regra ESLint bloqueia invoke direto de `twilio-whatsapp-send` / `meta-whatsapp-send` fora desse arquivo. Reuse no mobile.

Payload (`WhatsAppSendPayload`):

```ts
{
  organizationId: string;
  contactId?: string;
  threadId?: string;
  message?: string;              // texto livre
  templateId?: string;           // OU template
  templateVariables?: Record<string, string | number>;
  mediaUrl?: string;             // 1 mídia
  mediaUrls?: string[];          // várias
  mediaType?: 'image'|'audio'|'video'|'document';
  userId?: string;
  replyToMessageId?: string;     // quote
  isAgentMessage?: boolean;
  senderName?: string;
  senderContext?: 'messages' | 'inbox';  // qual superfície
  businessContext?: 'sales'|'customer_service'|'other'|null;
  endpointId?: string;           // opcional — força um endpoint
  dryRun?: boolean;
}
```

Fluxo interno:
1. Se `threadId` tem `primary_endpoint_id`, ele **vence** qualquer `endpointId` que a UI passar (regra dura anti cross-number).
2. Resolve provider: `endpoint_explicit` → `thread_primary_endpoint` → `thread_last_message_endpoint` → `default (twilio)`.
3. Re-rota lazy "Comercial → Meta 7020" só para orgs específicas (Central Trabalhista) e só em **novas** threads. Ignorar no mobile — o dispatcher já cuida.
4. Guard de compliance por template/endpoint (`assertTemplateAllowedForEndpoint`).
5. Invoca `meta-whatsapp-send` (via fetch direto) ou `twilio-whatsapp-send` (via `supabase.functions.invoke`).

Retorna `{ data, error }` no mesmo formato do `supabase.functions.invoke`.

### 3.2 Sincronia

**Semi-síncrono.** A edge function faz o INSERT em `messages` com `whatsapp_status = 'pending'` **antes** de chamar o provider, depois atualiza para `queued/sent/failed` conforme a resposta HTTP do Twilio/Meta. Ou seja: se a chamada retornar `{ error: null }`, a mensagem já está no banco e visível na UI imediatamente. O status **final** (`delivered`/`read`) chega depois via webhook. No mobile: mostrar a mensagem otimista logo após o retorno da função, e deixar Realtime atualizar o ícone de status.

### 3.3 Compliance server-side (não replicar no cliente, só respeitar)

`meta-whatsapp-send` (770 LOC) aplica: janela 24h, `allowed_purposes` do template vs. endpoint, rate limit, e log em `compliance_blocks`. O client já bloqueia freeform fora da janela na UI, mas o servidor é o gate real.

---

## 4. Recebimento inbound

### 4.1 Webhooks

- Meta Cloud → `supabase/functions/meta-whatsapp-webhook` (1053 LOC). `GET` verifica com `hub.challenge`; `POST` recebe mensagens/statuses. Resolve org por `waba_id` → `communication_endpoints`.
- Twilio → `supabase/functions/twilio-whatsapp-webhook`. Resolve org por `messaging_service_sid` (cross-org routing) e valida HMAC.

Ambos escrevem em `messages` + `message_threads` (com update de `last_message_*` e `last_inbound_at` via trigger) e podem enfileirar em `integration_inbound_events` (pipeline novo, [ADR-0004]). Mídia inbound é baixada e re-hospedada em `whatsapp-media` (bucket público) ou fica como URL Twilio (que exige proxy — ver §7).

Depois disso, `meta-whatsapp-webhook` dispara `ai-agent-respond` se a org tiver IA ativa.

### 4.2 Como o mobile detecta mensagem nova — Realtime

**Ordem de preferência:**

1. **Supabase Realtime** (canal `postgres_changes`) em `public.messages` filtrando `organization_id=eq.<org>` e `direction=eq.inbound`. Confirmado em `pg_publication_tables`. RLS deixa passar tudo da org.
2. **Realtime em `public.message_threads`** para atualizar `last_message_*`, `status`, `assigned_user_id`, `needs_human_attention`, `agent_typing`.
3. **Realtime em `public.notifications`** filtrando `user_id=eq.<self>` — dá pra usar como fonte para toast/badge do app.
4. **Polling fallback (5s)** para quando o socket cai — o web mobile (`MobileMessagesList.tsx`) já faz isso e o hook `useMessageThreads` também tem visibilidade-refetch (`VISIBILITY_REFETCH_MS = 60s`).

Sempre assinar dentro de `useEffect` e remover com `supabase.removeChannel(channel)` no cleanup (memória de projeto — subscrição solta gera loop de reconnect caro).

### 4.3 Push notification real (browser/mobile)

**Não existe hoje.** Não há tabela `device_tokens`/`push_subscriptions` no schema (verifiquei — só `subscriptions` de billing). O web usa apenas Realtime + `notifications` in-app. Para o mobile:

- Fase 1: polling + Realtime, sem push nativo — igual ao web.
- Fase 2 (opcional): criar `public.push_subscriptions (user_id, organization_id, platform, token, endpoint, keys jsonb, created_at)` + edge function de envio, gatilhada pelo trigger `new_message_notification` em `messages`. Não existe nada disso hoje.

---

## 5. Janela de 24h do WhatsApp

**Sim, o web trata.** Fonte: `src/lib/serviceWindow.ts` + hook `useServiceWindow`.

Duas janelas independentes:

- **`conversationWindow` (24h)** — âncora `message_threads.last_inbound_at`. Se `now < last_inbound_at + 24h`, permite texto livre. Fora dela: **só templates aprovados**. O `isOpen` do `getServiceWindow(...)` é EXATAMENTE isso.
- **`billingWindow` CTWA (72h)** — âncora `contact.ad_referral_captured_at || contact.created_at` quando o contato veio de CTWA (`source='ctwa'` OU `ad_referral_ctwa_clid` OU `utm_medium='ctwa'`). **Não libera freeform** — só sinaliza que templates são gratuitos por Meta. Informativo na UI.

**Regra prática no mobile:**

```ts
const win = getServiceWindow({ lastInboundAt: thread.last_inbound_at, contact });
if (!win.isOpen) {
  // Desabilita textarea de mensagem livre.
  // Abre seletor de whatsapp_templates com status='approved' e
  // allowed_purposes contendo o purpose do endpoint da thread.
}
```

O servidor bloqueia de qualquer jeito (`compliance_blocks`), então UI é UX; a segurança já está no back.

---

## 6. Contagem de não lidas

Calculada por **JOIN entre `message_threads.last_message_at` e `message_thread_reads.last_read_at`**, feito dentro do RPC `rpc_list_message_threads` que devolve `is_unread: boolean` já pronto (ver `useMessageThreads.ts` linhas 24-66).

Regra: `is_unread = last_message_direction = 'inbound' AND (last_read_at IS NULL OR last_read_at < last_message_at)`.

Marcar como lido = upsert em `message_thread_reads`:

```ts
await supabase.from('message_thread_reads').upsert({
  thread_id, user_id, last_read_at: new Date().toISOString()
});
```

(referência: `MessagesList.tsx` ~linha 1040). Depois, atualize localmente a flag — a tabela não está no realtime.

**Badge global** (contador de threads não lidas): contar linhas onde `is_unread=true` no retorno do RPC. Não há coluna denormalizada de contagem no banco.

---

## 7. Mídia

### 7.1 Upload outbound

`src/lib/inboxMediaUpload.ts` (usado por `/inbox`) e a versão idêntica em `WhatsAppChat.tsx` (usado por `/messages`):

- Bucket **`whatsapp-media`** (public=true).
- Path: `${organizationId}/${timestamp}-${rand}.${ext}`.
- Detecção de tipo via mime: `image/*` → `image`, `audio/*` → `audio`, `video/*` → `video`, resto `document`.
- Devolve `data.publicUrl` — passa direto em `mediaUrl`/`mediaUrls` do `dispatchWhatsAppSend`.

Para o mobile: reusar essa função. Como o bucket é público, a URL entregue vai direto ao Meta/Twilio.

### 7.2 Mídia inbound

- **Meta**: o webhook baixa via Graph API e re-hospeda em `whatsapp-media` (URL pública).
- **Twilio**: às vezes fica como `https://api.twilio.com/…Media/…` — essas URLs pedem Basic Auth e o navegador dispararia prompt de login.

### 7.3 Proxy autenticado — `twilio-media-proxy`

`src/lib/mediaProxy.ts` (já leu): função `getProxiedMediaUrl(url, orgId, accessToken)` — se `hostname==='api.twilio.com'`, monta URL para a edge function `twilio-media-proxy` passando `url`, `orgId` e `access_token`. Para outras URLs retorna intacta. **Reutilizar no mobile sem mudanças** — é o mesmo padrão pedido.

### 7.4 Player de áudio inline

Sim. Player compacto (43px) usado para voice notes do WhatsApp: `src/components/messages/*` + componentes de áudio em `src/components/whatsapp/`. Suporta `<audio>` HTML5 com o URL (proxied se Twilio). Existe transcrição opcional em `audio_transcriptions.transcript` (edge function `transcribe-audio`) exibida abaixo do player.

Para mobile: HTML5 `<audio>` funciona em WebView; se for Capacitor nativo, `@capacitor-community/native-audio` ou similar dá mais confiabilidade em iOS (política de autoplay).

---

## 8. Permissions

Não há permission key específica só de `can_view_messages`. O que existe (usado nos RLS de `message_threads`):

- **`user_can_view_all(org, 'threads')`** — libera ver TODAS as threads da org.
- **`user_has_cs_permission(org, 'can_manage_cs_queue')`** — libera ver threads sem responsável (fila).
- Sem qualquer uma acima, o usuário só vê threads em que `assigned_user_id = current_user_id()` — ou seja, **existe sim regra "só minhas conversas atribuídas"**, e é o default.
- Para `messages`, `whatsapp_templates`, `communication_endpoints`, `notifications`: acesso é por membership ativo na org (`user_organizations.is_active=true`).
- Para operar envio: gate de feature é `useWhatsAppIntegration().hasWhatsAppIntegration` (existe pelo menos 1 `communication_endpoints` `is_active=true` da org).

No mobile: **não invente novas permission keys**. Chame o RPC `rpc_list_message_threads` e confie que as políticas filtram — se o usuário for restrito, o RPC devolve `error='ACCESS_DENIED'` (tratado em `useMessageThreads` linhas 110-114).

---

## 9. Notificação de mensagem nova

Recap do §4.3: hoje **não há push notification nativo**. O feedback ao atendente é:

1. `notifications` (in-app) — insert por trigger `new_message_notification` em `messages`. Consumido via Realtime → toast + badge.
2. Badge de unread por thread — via `rpc_list_message_threads` + `message_thread_reads`.
3. Título da aba web (`document.title`) piscando (implementado em MessagesList) — não aplicável em mobile nativo.

Para mobile nativo (Capacitor / PWA):
- **PWA**: Web Push (Notification API + `service-worker.js`) funciona em Android/desktop; em iOS só a partir de PWA instalada (iOS 16.4+). Precisaria criar tabela `push_subscriptions` (não existe).
- **Capacitor**: FCM/APNS via `@capacitor/push-notifications`. Mesmo requisito de tabela de tokens + edge function de envio.

Recomendação: **Fase 1 sem push** — Realtime + polling já cobre atendimento com o app aberto. Push é Fase 2, com decisão explícita de criar `push_subscriptions` + worker.

---

## 10. Recap para começar o mobile

Ordem sugerida de implementação:

1. **Lista de conversas** por organização: chamar `supabase.rpc('rpc_list_message_threads', { p_organization_id, p_channels: ['whatsapp'], p_limit, p_search })`. Renderizar `contact_name`, `last_message_content`, `last_message_at`, badge `is_unread`, chip de `assigned_user_name`. Realtime em `message_threads` para atualização in-place.
2. **Detalhe da thread**: `messages` where `thread_id=eq.<id>` and `deleted_at is null` order by `sent_at`/`created_at`. Realtime em `messages` filtrando `thread_id`. Marcar como lida ao abrir (upsert `message_thread_reads`).
3. **Composer**:
   - Calcular `getServiceWindow({ lastInboundAt: thread.last_inbound_at, contact })`.
   - Se `isOpen`: liberar texto + mídia via `inboxUploadMedia` → `dispatchWhatsAppSend({ threadId, contactId, message, mediaUrls, mediaType, senderContext:'messages', businessContext: thread.business_context, userId })`.
   - Se fechado: seletor de `whatsapp_templates` (status `approved`, provider = provider do `primary_endpoint`, `allowed_purposes` compatível com `endpoint.purpose`). Enviar com `templateId` + `templateVariables`.
4. **Mídia**: sempre passar por `getProxiedMediaUrl` antes de exibir.
5. **Áudio**: `<audio>` com URL (proxied) + transcript opcional de `audio_transcriptions`.
6. **Nada de push** na Fase 1 — Realtime + polling.

Nunca chamar `twilio-whatsapp-send` / `meta-whatsapp-send` diretamente. Nunca escrever em `messages` do cliente para simular outbound — a edge function é quem grava.

---

## 11. Pendências / drifts a ter em mente

- `scheduled-messages-cron` sem cron (drift #3) — evitar prometer envio agendado.
- `rpc_list_message_threads` tem 2 overloads (drift #7) — chamar com todos os 4 parâmetros nomeados como no `useMessageThreads.ts` para não cair no overload errado.
- `messages_endpoint_backfill_2b` (92k linhas) e outros backfills de `message_threads.business_context` ainda ativos — thread nova pode nascer com `business_context=null` antes do trigger consolidar; tratar `null` como "sales" default em `/messages` só para efeito de UI.
- Inbox v2 em rollout com flag off — o mobile deve começar por `/messages` (comercial). Inbox mobile é escopo separado.
