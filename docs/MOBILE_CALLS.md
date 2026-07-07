# Módulo Chamadas — Referência para o app Mobile

Documento único, técnico, escrito a partir do código real (não de suposições). Fontes verificadas:

- `src/contexts/OutboundCallContext.tsx` (outbound), `src/hooks/useInboundCalls.ts` (inbound) — ambos usam `@twilio/voice-sdk` com `new Device(token)`.
- `src/components/contacts/ContactCalls.tsx` — aba "Chamadas" do contato (botões, filtros, form Registrar).
- `src/components/calls/ScheduleCallDialog.tsx` — form "Agendar".
- `src/components/calls/{OutboundCallModal,ActiveCallModal,IncomingCallModal,MinimizedCallWidget,DialPad,CallRecordingPlayer,CallStatusBadge}.tsx` — UI de chamada ativa.
- `supabase/functions/twilio-token/index.ts` — Access Token JWT.
- `supabase/functions/twilio-call/index.ts` — originate REST (existe, mas **não é** o caminho do botão "Ligar" atual).
- `supabase/functions/twilio-webhook/index.ts` — status/TwiML/recording.
- Schema `public.calls` (20 colunas) e `public.call_recordings` (9 colunas), lidos direto do banco.
- RLS e policies conferidas via `pg_policies`.

---

## 1. TL;DR para o mobile

- O botão **"Ligar" hoje é WebRTC embutido no browser** (Twilio Voice JS SDK). **Não é bridge/click-to-call telefônico.** O microfone do rep é o próprio endpoint da chamada.
- Replicar 1:1 no mobile exige **SDK nativo do Twilio Voice** (`@twilio/voice-react-native`, ou plugins Capacitor sobre `twilio-voice-ios` / `twilio-voice-android`) + integração **CallKit (iOS)** / **ConnectionService (Android)** e permissão de microfone. É projeto grande.
- **Alternativa pragmática recomendada para Fase 1:** usar `tel:<E164>` do próprio celular (abre o discador nativo, ligação PSTN normal) e depois registrar o resultado manualmente via o mesmo fluxo de "Registrar" que já existe. Zero infra nova.
- **Alternativa server-side (Fase 1.5, se quiser tracking automático):** implementar um **bridge** novo (Twilio `<Dial>` two-legged) que liga primeiro pro celular do rep e depois conecta com o contato. Precisa de uma edge function nova; não existe hoje.

Listagem, filtros, "Agendar" e "Registrar" **funcionam idênticos ao web no mobile** — são apenas SELECT/INSERT em `public.calls`. Não dependem de SDK nenhum.

---

## 2. Mecanismo real do "Ligar" (web hoje)

### Fluxo passo a passo

1. `ContactCalls.tsx` chama `useOutboundCall().startCall({ phoneNumber, contactName, contactId, opportunityId })`.
2. `OutboundCallContext` chama edge function **`twilio-token`** (`supabase.functions.invoke('twilio-token')`) → retorna um **Access Token JWT** do Twilio contendo `VoiceGrant` amarrado ao `TWIML_APP_SID` e a uma identidade (`user:<userId>`).
3. Import dinâmico: `const { Device, Call } = await import('@twilio/voice-sdk')` e `new Device(token, { codecPreferences: ['opus','pcmu'], ... })`.
4. `device.register()` prepara para receber inbound. Para outbound: `device.connect({ params: { To, contactId, opportunityId, userId } })`.
5. O Twilio abre um socket WebRTC do browser → executa a **TwiML App** apontada pelo `TWIML_APP_SID`, que aponta para `https://.../functions/v1/twilio-webhook/twiml`.
6. `twilio-webhook/twiml` responde com `<Response><Dial callerId="+..."><Number>{To}</Number></Dial></Response>` → o Twilio disca via PSTN pro contato e faz o *bridge* com o WebRTC do rep.
7. Áudio bidirecional: mic do browser ↔ Twilio ↔ contato. O rep não recebe ligação telefônica; ele fala **pelo notebook**.

### O que isso **não** é

- **Não é** um bridge onde o Twilio liga primeiro pro celular do rep. O rep não recebe chamada PSTN. Se o notebook estiver mudo/sem mic/sem internet, a chamada não sai.

### Implicações para o mobile

| Opção | Custo | UX no celular | Registro automático |
|---|---|---|---|
| **A. `tel:` nativo (recomendada Fase 1)** | Zero | Ligação padrão do celular, o SO cuida (CallKit/discador). | Não — rep aperta "Registrar" depois. |
| **B. Bridge server-side novo** | Uma edge function nova (`twilio-bridge`) que faz REST originate pro celular do rep e usa `<Dial>` pro contato quando ele atende. | Rep recebe chamada telefônica normal, atende, fala com o contato pela linha do celular. | Sim — o mesmo webhook `twilio-webhook/status` já atualiza `calls`. |
| **C. Twilio Voice SDK nativo (paridade total com web)** | Alto (Capacitor plugin, CallKit, ConnectionService, permissões, push VoIP, revisão App Store). | Chamada VoIP dentro do app, tela custom ou CallKit. | Sim, via webhook. |

A rota A já cobre 90% do uso real em campo. As rotas B e C podem vir depois sem quebrar A.

---

## 3. Schema completo — `public.calls`

RLS: 2 policies (`ALL`) com `qual = user_has_org_access(organization_id)` — **todo membro da org lê e escreve todas as chamadas**. Sem regra "só minhas".

| Coluna | Tipo | Null | Default | Uso |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `organization_id` | uuid | NO | — | Tenant. Sempre presente. |
| `contact_id` | uuid | YES | — | FK `contacts.id`. Nulo se chamada avulsa. |
| `opportunity_id` | uuid | YES | — | FK `opportunities.id`. |
| `user_id` | uuid | **NO** | — | **Responsável / owner.** FK `public.users.id` (não `auth.users`). |
| `direction` | text | NO | — | Enum lógico: `'outgoing' \| 'incoming'`. |
| `status` | text | YES | `'completed'` | Enum lógico (ver abaixo). |
| `call_type` | text | YES | `'made'` | Enum lógico: `'made' \| 'received' \| 'scheduled'`. Usado pelos filtros. |
| `call_sid` | text | YES | — | SID do Twilio (`CA...`). Só existe em chamadas Twilio, não em manuais. |
| `from_number` | text | YES | — | E.164. |
| `to_number` | text | YES | — | E.164. |
| `started_at` | timestamptz | YES | `now()` | Início efetivo (ou momento do registro manual). |
| `answered_at` | timestamptz | YES | — | Setado pelo webhook `status` no evento `answered`. |
| `ended_at` | timestamptz | YES | — | Setado pelo webhook no evento `completed`. |
| `scheduled_at` | timestamptz | YES | — | Preenchido só em `call_type='scheduled'`. |
| `duration_seconds` | integer | YES | — | Setado pelo webhook `completed` (ou manualmente no form "Registrar"). |
| `notes` | text | YES | — | Notas livres. |
| `is_sample` | boolean | YES | `false` | Dados de exemplo. |
| `deleted_at` | timestamptz | YES | — | Soft delete — o mobile **deve** filtrar `.is('deleted_at', null)`. |
| `created_at` | timestamptz | YES | `now()` | — |

### Enum real de `status` (valores confirmados em produção)

`queued`, `ringing`, `in-progress`, `completed`, `no-answer`, `busy`, `failed`.

São exatamente os `CallStatus` do Twilio (https://www.twilio.com/docs/voice/api/call-resource#call-status-values). O CRM não normaliza — grava o valor cru vindo do webhook. `CallStatusBadge` traduz para PT: "Concluída / Chamando / Em andamento / Ocupado / Não atendeu / Falhou / Na fila".

### Sobre "motivo de não atendimento" (`disposition`)

**Não existe coluna `disposition`.** O motivo é o próprio `status` (`no-answer` / `busy` / `failed`). Se o mobile precisar de granularidade maior (ex.: "voicemail", "wrong number"), o local seria `notes` — ou pedir nova coluna via migration.

### `public.call_recordings` (9 colunas)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant |
| `call_id` | uuid | FK → `calls.id` (relação 1:N — uma chamada pode ter múltiplas gravações) |
| `recording_sid` | text | SID Twilio (`RE...`) |
| `recording_url` | text | URL Twilio (autenticada — passa por `twilio-media-proxy` para tocar no browser) |
| `duration_seconds` | integer | — |
| `file_size_bytes` | bigint | — |
| `transcription` | text | Preenchido pela edge `transcribe-audio` (Whisper via Lovable AI Gateway) |
| `created_at` | timestamptz | — |

RLS idêntica a `calls` (`user_has_org_access`).

---

## 4. Fluxo do botão "Ligar" — o que o mobile precisa saber

- **Resposta não é síncrona.** O `startCall` retorna assim que o Twilio aceita o `connect`; o resultado real (atendeu? tocou? falhou?) chega **por webhook depois**.
- `twilio-webhook/status` recebe eventos `initiated / ringing / answered / completed` (registrados via `StatusCallbackEvent`) e faz `UPDATE public.calls` filtrando por `call_sid`:
  - `ringing` → `status='ringing'`
  - `answered` → `status='in-progress'`, `answered_at=now()`
  - `completed` → `status='completed'` (ou `no-answer`/`busy`/`failed` conforme `CallStatus` no payload), `ended_at=now()`, `duration_seconds=<CallDuration>`.
- Se `enable_recording=true` na config Twilio, `twilio-webhook/recording` insere uma row em `call_recordings` quando a gravação fica pronta.

### Estratégia para o mobile

**Recomendo Realtime** (não polling):

```ts
supabase
  .channel(`calls:${contactId}`)
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'calls', filter: `contact_id=eq.${contactId}` },
    (payload) => queryClient.invalidateQueries(['calls', contactId]))
  .subscribe();
```

A tabela `calls` está no `supabase_realtime` publication (usada pela UI web). Como a RLS deixa todos da org lerem, o realtime já entrega. **Sempre dentro de `useEffect` com cleanup `supabase.removeChannel(channel)`** (regra do projeto).

Fallback se realtime cair: polling de 5s enquanto a última row do contato estiver em `queued|ringing|in-progress`.

---

## 5. Fluxo "Agendar"

`ScheduleCallDialog.handleSubmit` faz **dois inserts** e **não dispara ligação alguma**:

1. `INSERT INTO public.calls` com:
   - `call_type='scheduled'`, `status='queued'`, `direction='outgoing'`
   - `scheduled_at=<data+hora>`, `to_number=contactPhone`
   - `notes` (opcional)
2. `INSERT INTO public.tasks` com:
   - `task_type='call'`, `due_at=<scheduled_at>`, `priority='medium'`, `status='open'`
   - `title="Ligar para <nome>"`, `assigned_user_id=<rep>`

**Não há cron que dispare a ligação automaticamente.** No horário, a UI mostra o card com botão "Ligar agora" (linha 349 de `ContactCalls.tsx`) — condicional a `call_type='scheduled' && status='queued' && hasVoiceIntegration`. Apertar esse botão cai no mesmo `startCall` do WebRTC.

### Implicação para mobile

- Se o botão "Ligar" no mobile virar `tel:`, o "Ligar agora" das agendadas segue a mesma regra: abre o discador. A row em `calls` original (a agendada) fica órfã de `call_sid` — dá pra optar por (a) deixar como está e criar nova row ao concluir, ou (b) fazer UPDATE nela com o resultado do "Registrar". Recomendo (b) para não duplicar histórico.

---

## 6. Fluxo "Registrar" (ligação manual, fora do sistema)

Campos exatos do form (linhas 226-272 de `ContactCalls.tsx`):

| Campo | Tipo | Opções | Obrigatório |
|---|---|---|---|
| `direction` | select | `outgoing` (Realizada) / `incoming` (Recebida) | Sim (default `outgoing`) |
| `status` | select | `completed` / `no-answer` / `busy` / `failed` — **subset** do enum, sem `queued/ringing/in-progress` | Sim (default `completed`) |
| `duration_seconds` | number | — | Não |
| `notes` | textarea | — | Não |

Ao salvar:

```ts
INSERT INTO public.calls (
  organization_id, contact_id, opportunity_id, user_id,
  direction, status,
  call_type = direction === 'outgoing' ? 'made' : 'received',
  duration_seconds, notes,
  started_at = now()
)
INSERT INTO public.activities (
  organization_id, contact_id, opportunity_id,
  activity_type = 'call',
  title = 'Ligação realizada' | 'Ligação recebida',
  body = notes,
  created_by_user_id, occurred_at = now()
)
```

Note: **não** grava `call_sid`, `from_number`, `to_number`, `answered_at`, `ended_at`. Pode ser útil no mobile pré-preencher `to_number = contactPhone` (o web não faz, seria uma melhoria).

---

## 7. Permissões e visibilidade

- **Não existe permission key específica** para chamadas no projeto. Grep em `src/hooks/usePermissions.ts` e `docs/product/permissions-overview.md` não retorna `can_view_calls`, `can_manage_calls` nem equivalentes.
- **Gate de UI atualmente usado:** `useVoiceIntegration().hasVoiceIntegration` — verdadeiro se existe `organization_integrations` com `slug='twilio-voice'` ativo. Se falso, os botões "Ligar" e "Agendar" **não aparecem** (mas "Registrar" continua disponível). O mobile deve seguir a mesma regra.
- **RLS:** a policy é `ALL USING (user_has_org_access(organization_id))` — qualquer membro da organização vê **todas** as chamadas. **Não há** "só vejo minhas" como acontece em Oportunidades (que tem role-based scope).
- Se o mobile quiser oferecer o filtro "só minhas", é **filtro client-side**: `.eq('user_id', userProfile.id)`.

---

## 8. Filtros "Todas / Feitas / Recebidas / Agendadas"

Lógica exata (linhas 157-163 de `ContactCalls.tsx`) — reproduz literalmente:

```ts
if (filter === 'all')       return true;
if (filter === 'made')      return call.call_type === 'made'
                                 || (call.direction === 'outgoing' && call.call_type !== 'scheduled');
if (filter === 'received')  return call.call_type === 'received' || call.direction === 'incoming';
if (filter === 'scheduled') return call.call_type === 'scheduled';
```

- Baseado em **`call_type` primeiro**, com `direction` como fallback (por causa de dados antigos que não tinham `call_type` populado corretamente).
- **Não existe** campo booleano tipo `is_scheduled`; agendadas são detectadas por `call_type='scheduled'` e/ou `scheduled_at IS NOT NULL`.

Para query server-side (mais eficiente no mobile do que trazer tudo e filtrar):

- Feitas: `.or('call_type.eq.made,and(direction.eq.outgoing,call_type.neq.scheduled)')`
- Recebidas: `.or('call_type.eq.received,direction.eq.incoming')`
- Agendadas: `.eq('call_type', 'scheduled')`

---

## 9. UI de chamada ativa e gravação (para referência)

Se você optar pela rota A (`tel:` nativo), **nada disso precisa ser replicado** — o SO do celular assume a tela de chamada. Documentado apenas para caso opte por SDK nativo (rota C).

### Componentes web existentes

| Arquivo | Papel |
|---|---|
| `OutboundCallModal.tsx` | Tela cheia da chamada saindo: avatar, nome, número, timer, mute, DTMF, minimizar, encerrar. |
| `ActiveCallModal.tsx` | Variante maior (463 linhas) com controles adicionais. |
| `IncomingCallModal.tsx` | Chamada entrando: aceitar / recusar. |
| `MinimizedCallWidget.tsx` | Bolha flutuante quando o modal é minimizado. |
| `DialPad.tsx` | Teclado DTMF durante a chamada. |
| `CallRecordingPlayer.tsx` | Player de áudio inline em cada card de chamada quando existe `call_recordings`. |
| `CallStatusBadge.tsx` | Tradução PT dos status. |

### Máquina de estados (`CallStatus` em `OutboundCallContext.tsx`)

`initializing → ready → connecting → ringing → connected → ended` (ou `failed` como saída lateral de qualquer estado).

Controles ativos por estado:
- `connected`: mute, DTMF, encerrar, minimizar.
- `ringing / connecting`: apenas encerrar.
- `failed / ended`: modal auto-fecha em ~2s.

### Player de áudio das gravações

Existe **sim** e aparece dentro de cada card de chamada quando `call_recordings.length > 0`. O URL da gravação é servido via `twilio-media-proxy` (autenticado — não expõe credentials do Twilio no browser). O mobile deve usar o mesmo proxy.

---

## 10. Recomendação para o app mobile (faseamento)

**Fase 1 — entrega rápida, zero infra nova:**
- Aba "Chamadas" mobile lista `public.calls` do contato (mesma query, `deleted_at IS NULL`, order by `started_at desc`).
- Filtros idênticos ao web (`Todas / Feitas / Recebidas / Agendadas`) — preferir query server-side.
- Botão "Registrar" — form idêntico. Pré-preencher `to_number=contactPhone` (melhoria vs. web).
- Botão "Agendar" — idêntico (cria `calls` scheduled + `tasks`).
- Botão "Ligar" — **abre `tel:<E164>`** (Capacitor: `window.location.href = 'tel:...'` ou `AppLauncher.openUrl`). Ao voltar pro app, mostrar toast "Registrar essa ligação?" que abre o form já pré-preenchido.
- Realtime na tabela `calls` filtrado por `contact_id` para refletir mudanças de outros usuários.

**Fase 2 (se houver demanda) — tracking automático sem SDK nativo:**
- Nova edge function `twilio-bridge` que faz REST originate pro celular do rep e liga com `<Dial>` pro contato quando o rep atende. Cria row em `calls` com `call_sid` — o webhook existente já atualiza o resto.
- Requer campo novo em `users` (ou em `communication_endpoints`): telefone pessoal do rep para o bridge.

**Fase 3 (opcional) — paridade total:**
- Capacitor plugin sobre `twilio-voice-ios` / `twilio-voice-android` + CallKit/ConnectionService + push VoIP + review de loja. Projeto de porte, só se justificar.

---

## Referências rápidas

- Docs internos: `docs/audit/04-integracoes/voice-twilio.md`, `docs/integrations/voice-twilio/README.md`.
- Memory: `integrations/twilio-voice-architecture-consolidated`, `integrations/twilio-voice-security-isolation`, `architecture/outbound-call-provider-isolation`.
- Edge functions: `twilio-token`, `twilio-call`, `twilio-webhook`, `twilio-media-proxy`, `transcribe-audio`.
