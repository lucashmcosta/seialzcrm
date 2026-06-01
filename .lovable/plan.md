
# Fase 1.3D — Build (migration ✅ já aplicada)

## Status atual
- ✅ Migration de proteção das notas internas **aplicada** (`fn_update_thread_last_message`, `fn_messages_intelligence_enqueue`, `create_message_activity`).
- ⏭ Edge function e frontend pendentes — exigem build mode.

---

## Passo A — `supabase/functions/twilio-whatsapp-send/index.ts`

Editar **só** o caminho `senderContext === 'inbox'` (linhas 241–294). Restante intocado.

1. Trocar `const { ... }` por `let { ... }` na destruturação do body (linha 16) para permitir reatribuir `contactId` a partir de `thread.contact_id`.
2. Substituir o bloco inbox:
   - Carregar thread com `id, primary_endpoint_id, organization_id, channel, status, contact_id`.
   - Bloquear `status IN ('resolved','closed')` → `thread_closed`.
   - Reatribuir `contactId = thread.contact_id` (ignorar payload).
   - Carregar contato com `id, phone, full_name, lifecycle_stage, organization_id`; bloquear se `lifecycle_stage !== 'customer'` → `not_customer`.
   - Endpoint: permitir `purpose IN ('customer_service','other')`; manter bloqueio absoluto de `commercial`/`vendor_personal`. Em `other`, log warning `[inbox-send] endpoint_purpose_other`.
   - `inboxWhatsappFromOverride = whatsapp:${ep.external_address}` (já existe).
   - `inboxEndpointIdOverride = ep.id` (já existe).
3. Resto do fluxo (janela 24h, template, mídia, reply, Twilio call, insert em messages, activity) **inalterado** — usa `contactId` reatribuído.

Caminho `/messages` (sem `senderContext='inbox'`): **zero alteração**.

---

## Passo B — Frontend

### B1. Helper Inbox-only de upload de mídia
`src/lib/inboxMediaUpload.ts` — função pura `inboxUploadMedia(supabase, file, organizationId)` que retorna `{ url, mediaType }`. Duplica a lógica de `WhatsAppChat.tsx` (sem alterar `WhatsAppChat.tsx`) para não introduzir risco em `/messages`.

### B2. `src/hooks/inbox/useInboxThread.ts`
Adicionar ao SELECT: `assigned_user_id, status, organization_id`. Tipos no `useInboxThreads.ts` `InboxThreadRow` já cobrem.

### B3. `src/components/inbox/InboxComposer.tsx` (reescrita)
Props: `thread`, `contact`, `replyTo`, `onClearReply`, `onSent`.

Guards no client (defesa em profundidade):
- `contact.lifecycle_stage !== 'customer'` → composer disabled com motivo.
- `thread.status in ('resolved','closed')` → disabled.
- `primary_endpoint.purpose in ('commercial','vendor_personal')` → disabled.
- Atribuição:
  - sem assignee → botão "Assumir" (UPDATE `message_threads` com `assigned_user_id=me` + `last_routing_decision=jsonb('action':'manual_takeover', 'by_user_id':me, 'reason':'inbox_takeover')`). Trigger `trg_log_thread_assignment_change` registra automaticamente.
  - assignee é outro usuário e role !== admin → disabled + msg.
- Permissões: liberar para Admin/Superadmin (via `usePermissions`/role).

UI:
- Tabs **Responder** | **Nota interna**.
- **Responder**:
  - In-window 24h: `MediaUploadButton` + `AudioRecorder` + `Textarea` (Enter envia, Shift+Enter quebra) + botão enviar (estados sending/sent/failed inline).
  - Out-of-window: bloco "Fora da janela 24h — use template" + botão abre `WhatsAppTemplateSelector` em overlay.
  - `ReplyPreview` no topo quando `replyTo` setado, com X para limpar.
- **Nota interna**:
  - Textarea com fundo destacado (token `bg-warning/10` ou semântico). Placeholder "Nota visível apenas para a equipe".
  - Botão "Salvar nota". Insert direto via PostgREST: `messages.insert({ organization_id, thread_id, content, direction:'internal', is_internal_note:true, sender_type:'user', sender_user_id, sender_name, sent_at: now() })`. **Sem** chamada ao edge function.

Envio real: `supabase.functions.invoke('twilio-whatsapp-send', { body: { organizationId, threadId, senderContext:'inbox', userId, message|templateId|mediaUrl|mediaType|replyToMessageId|templateVariables|mediaUrls } })` — **sem `contactId`** (backend resolve via thread).

Erros mapeados (pt-BR): `not_customer`, `thread_closed`, `purpose_blocked`, `Outside 24h window. Must use a template.`, falha Twilio.

### B4. `src/components/inbox/InboxConversationTimeline.tsx`
- Botão "Responder" por bolha (hover/menu) → callback `onReply(message)` propagado pro `InboxThreadDetail`.
- Bolhas com `is_internal_note=true`: estilo distinto (badge "Nota interna", fundo amarelo suave); sem status whatsapp.
- Verificar/garantir subscription realtime em `messages` filtrada por `thread_id`.

### B5. `src/components/inbox/InboxThreadDetail.tsx`
- Trocar stub do composer por `<InboxComposer thread contact={thread.contact} replyTo onClearReply onSent />`.
- Estado local `replyTo`.

---

## Passo C — Validação no preview

| # | Cenário | Esperado |
|---|---|---|
| 1 | Texto em thread customer | enviado, status `sent` |
| 2 | Fora 24h | bloqueio inline + template envia |
| 3 | Imagem/doc/vídeo | upload + envio |
| 4 | Áudio gravado | envio |
| 5 | Reply com quote | `RepliedMessageSid` no log |
| 6 | Nota interna | sem chamada `twilio-whatsapp-send`; `last_message_content` da thread NÃO muda |
| 7 | Lead | bloqueio `not_customer` |
| 8 | Thread resolved | bloqueio `thread_closed` |
| 9 | `/messages` | comportamento idêntico |
| 10 | Realtime | timeline atualiza |

Validação de regressão de `last_message`: query SQL após inserir nota interna para confirmar que `message_threads.last_message_*` permanece com o valor da última mensagem real.

Se qualquer teste crítico falhar → parar e reportar antes de seguir.

---

## Arquivos

**Novos**
- `src/lib/inboxMediaUpload.ts`

**Editados**
- `supabase/functions/twilio-whatsapp-send/index.ts` (somente bloco inbox + linha do `let`)
- `src/hooks/inbox/useInboxThread.ts`
- `src/components/inbox/InboxComposer.tsx`
- `src/components/inbox/InboxConversationTimeline.tsx`
- `src/components/inbox/InboxThreadDetail.tsx`

**Já aplicado**
- Migration `<ts>_inbox_internal_notes_trigger_guards`

**Intocado**
- `WhatsAppChat.tsx`, `/messages`, `MessagesList.tsx`, mobile, `twilio-whatsapp-webhook`, Railway, regra de Inbox, Query A.

---

## Não-publicação

Nenhum deploy a produção. Sem `presentation-open-publish`.

Aprovar move para build mode e executo Passo A → B → C → relatório final.
