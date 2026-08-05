# Telefonia Twilio — voz + transferência (referência do DivusApp)

<!-- docs-validate: ignore-refs — Este documento descreve o repositório EXTERNO divus/platform (referência de design). Os paths src/... e supabase/... citados são do divus, não do Seialz, então não devem ser validados contra este filesystem. -->

> **O que é este documento.** Uma descrição técnica de ponta a ponta de **como o DivusApp (divus/platform) implementa telefonia Twilio**: chamadas WebRTC no navegador, inbound/outbound, controles em chamada, gravação e — principalmente — **transferência de ligações**. Serve de **referência** para replicar o comportamento aqui no Seialz.
>
> Tudo aqui é derivado do código real do divus/platform. Os caminhos de arquivo citados (`supabase/functions/...`, `src/...`) referem-se ao **repositório do divus**, não ao do Seialz.
>
> **Fora de escopo:** chamadas de **vídeo**. No divus o vídeo usa `@daily-co/daily-js` (`DailyVideoCall*`) — é uma stack totalmente separada do Twilio Voice e não tem nada a ver com o que está descrito aqui.

---

## 1. Visão geral da arquitetura

Dois pilares:

1. **WebRTC no navegador** — cada atendente (SDR/consultor) roda um _softphone_ na aba do navegador usando o **Twilio Voice SDK** (`@twilio/voice-sdk`). O navegador registra um `Device` com uma identidade WebRTC igual ao `auth_user_id` do usuário. Ligar/atender/mutar acontece client-side.

2. **Controle de pernas via REST do lado do servidor** — toda manipulação de uma chamada _já em andamento_ (colocar em espera, transferir, mover para conferência) é feita por **Edge Functions do Supabase** que chamam a **API REST do Twilio**, redirecionando a perna para um novo **TwiML gerado dinamicamente**. Não há TwiML Bins — todo TwiML é montado por edge function.

```
┌─────────────────────┐         JWT WebRTC          ┌──────────────────┐
│  Navegador (SDR)     │ ──── twilio-token ────────► │  Edge Functions   │
│  @twilio/voice-sdk   │                             │  (Supabase/Deno)  │
│  Device(identity=    │ ◄── TwiML (app voice) ───── │                   │
│    auth_user_id)     │        twilio-voice         │  twilio-voice     │
└──────────┬──────────┘                              │  twilio-call      │
           │ WebRTC media                            │  twilio-call-     │
           ▼                                         │    webhook        │
     ┌───────────┐   REST: POST /Calls/{Sid}.json    │  queue-control    │
     │  Twilio    │ ◄──── (Twiml redirect) ────────── │  voice-ring-all   │
     │  Cloud     │ ────► webhooks de status/gravação │  twilio-transfer- │
     └─────┬─────┘                                    │    call (legado)  │
           │ PSTN                                     └──────────────────┘
           ▼
     Cliente (telefone comum)
```

**A primitiva central de todo controle de chamada ao vivo** é sempre a mesma:

```
POST https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Calls/{CallSid}.json
Authorization: Basic base64(TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN)
Body: Twiml=<Response>...novo TwiML inline...</Response>
```

Isso é o "**TwiML redirect**": pega uma perna viva e a reaponta para um novo TwiML. Park, hold, mover para conferência e transferir são todos variações disso. Originar uma chamada nova usa `POST /Calls.json` com `From`, `To` e `Twiml`/`Url`.

---

## 2. Credenciais / variáveis de ambiente

Apenas os **nomes** (valores ficam nos secrets das Edge Functions):

| Variável | Uso |
|---|---|
| `TWILIO_ACCOUNT_SID` | Auth básica da REST API; base da URL `/Accounts/{SID}` |
| `TWILIO_AUTH_TOKEN` | Auth básica da REST API (controlar pernas, baixar gravação) |
| `TWILIO_PHONE_NUMBER` | `From`/callerId padrão nas chamadas originadas |
| `TWILIO_API_KEY` | Só no `twilio-token` — assinatura do JWT WebRTC |
| `TWILIO_API_SECRET` | Só no `twilio-token` — chave HMAC do JWT |
| `TWILIO_TWIML_APP_SID` | TwiML App atrás da qual o `twilio-voice` responde; grant `outgoing` do token |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Cliente Supabase (anon nas funções autenticadas, service-role nos webhooks) |

---

## 3. Token WebRTC — `twilio-token`

Arquivo: `supabase/functions/twilio-token/index.ts`.

- Autenticado pelo JWT do usuário (Bearer). Retorna `{ token, identity, outgoingNumber }`.
- Monta **manualmente** um JWT Twilio (`cty: "twilio-fpa;v=1"`), assinado **HS256** com `TWILIO_API_SECRET` via WebCrypto HMAC.
- **`identity = auth_user_id`** — este é o ponto de ancoragem de todo o roteamento. Toda a malha de `<Client>{auth_user_id}</Client>` no TwiML depende disso.
- Grants:
  ```json
  {
    "identity": "<auth_user_id>",
    "grants": {
      "voice": {
        "outgoing": { "application_sid": "<TWILIO_TWIML_APP_SID>" },
        "incoming": { "allow": true }
      }
    }
  }
  ```
- `exp = now + 3600` (validade 1h). `outgoingNumber` = `app_users.twilio_phone_number` do usuário (ou fallback).

---

## 4. Inicialização do Device no navegador

Pacote: **`@twilio/voice-sdk` `^2.16.0`** — `import { Device, Call } from "@twilio/voice-sdk"`.

**Mount lazy pós-auth** — `src/contexts/TwilioProviderLazy.tsx`: o provider real (e o chunk pesado do SDK) só é `React.lazy`-carregado **depois** da autenticação. Em `/auth` ou enquanto a auth carrega, os filhos renderizam sem `Device`.

**Criação do Device** — `src/contexts/TwilioContext.tsx` (dentro de um `useEffect` que só roda com `!loading && user && session`):

```ts
const { data } = await supabase.functions.invoke("twilio-token");
const twilioDevice = new Device(data.token, {
  logLevel: 1,
  codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
});
// ... registra listeners ...
await twilioDevice.register();
```

**Ciclo de eventos do Device** (registrados antes do `register()`):

| Evento | O que faz |
|---|---|
| `registered` | Só na 1ª vez (ref `hasRegisteredOnce`): reseta estado, marca chamadas `initiating` velhas como `failed` no banco, seta `isReady`, cacheia `app_users.id` em `currentAppUserId` |
| `error` | Seta erro; **re-registra sozinho após 5s** com token fresco |
| `unregistered` | Busca token novo → `updateToken` → `register` de novo |
| `tokenWillExpire` / `tokenExpired` | Renova o token via edge function + `updateToken` |
| `incoming` | Handler de chamada recebida (ver §6) |

Robustez extra:
- **Watchdog de registro:** um `setTimeout` de 15s tenta re-registrar até `MAX_REGISTRATION_RETRIES = 3` se o evento `registered` não vier.
- **Supressão de ruído do SDK:** um `unhandledrejection` handler global engole `AbortError`/rejeições nulas internas do Twilio no disconnect.
- **Finalização resiliente:** `beforeunload`/`visibilitychange` persistem um `pendingCallFinalization` id em `localStorage` para limpeza posterior (`useCallFinalization`).

---

## 5. Chamada outbound

Há dois caminhos de outbound no divus. O que a UI usa por padrão é o **WebRTC direto** (`makeCall`), mas existe também o originador **"consultor primeiro"** (`twilio-call`). Documento os dois.

### 5a. Outbound WebRTC (o normal) — `makeCall(...)`

`src/contexts/TwilioContext.tsx` → `makeCall(phoneNumber, contactId?, leadId?)`:

1. Bloqueia chamadas concorrentes (`currentCall || isInitiatingCall`).
2. Checa permissão de microfone (`navigator.permissions.query({name:'microphone'})`); se negada, dispara evento `window` `microphone-permission-denied` e aborta.
3. Resolve `contactId` (via `leadId`/telefone se preciso).
4. Insere linha em `calls` (`status:"initiating"`, `direction:"outbound"`, `provider:"twilio"`, `handled_by_app_user_id`).
5. `device.connect({ params: { To, targetPhone, direction:"outbound", callRecordId } })`.
6. Twilio POSTa no `twilio-voice` (a TwiML App), que devolve o `<Dial>` para o número (ver §5c). Listeners por chamada: `ringing` salva `twilio_call_sid`; `accept` → `status:"in-progress"`, `isOnCall=true`; `disconnect` finaliza (`completed`/`failed`, duração, auto-conclui chamadas agendadas casadas); `error` → `callError`. Disconnect em <3s marca `instantDisconnect`.

### 5b. Outbound "consultor primeiro" — `twilio-call`

`supabase/functions/twilio-call/index.ts` (`action:'initiate'`): cria a linha em `calls`, e **origina via REST `POST /Calls.json` primeiro para o consultor** (`To: consultantPhone`), com `Url` apontando para `twilio-call-webhook?targetPhone={contato}&callRecordId=...`. Quando o consultor atende, o webhook devolve TwiML que **então** disca o contato:

```xml
<Say>Conectando…</Say>
<Dial record="record-from-answer-dual"><Number>{targetPhone}</Number></Dial>
```

Salva `twilio_call_sid` de volta na linha. `Record:'true'` + status/recording callbacks.

### 5c. TwiML de outbound (dentro do `twilio-voice`)

`supabase/functions/twilio-voice/index.ts`, quando `isOutbound && dialNumber`:

```xml
<Dial callerId="{callerId}" record="record-from-answer-dual"
      recordingStatusCallback="{.../twilio-call-webhook?callRecordId=...}"
      statusCallback="{.../twilio-call-webhook}" statusCallbackMethod="POST"
      statusCallbackEvent="initiated ringing answered completed">
  {dialNumber}
</Dial>
```

`callerId` = `app_users.twilio_phone_number` do autor (resolvido a partir da identidade `client:`), senão `TWILIO_PHONE_NUMBER`.

---

## 6. Chamada inbound

`supabase/functions/twilio-voice/index.ts` é a URL do número inbound. Ao receber:

1. Procura `app_users` pelo número `to` (o número Twilio discado) para achar o agente de destino.
2. **Detecta chamada interna** (o `from` é também um número Twilio) → disca direto `<Dial><Client>{user.auth_user_id}</Client></Dial>` **sem criar nova linha**.
3. Caso contrário insere uma linha inbound em `calls` (casando contato/lead por `primary_phone`, com match flexível pelos últimos 10 dígitos) e disca o WebRTC do agente com gravação dual + callbacks:

```xml
<Dial record="record-from-answer-dual" recordingStatusCallback="{cb?callRecordId=}"
      action="{cb?callRecordId=}" method="POST"
      statusCallback="{cb?callRecordId=}" statusCallbackEvent="initiated ringing answered completed">
  <Client>{user.auth_user_id}</Client>
</Dial>
```

No navegador, o evento `incoming` do Device abre o `IncomingCallModal`. Se `isPickingUpRef` estiver ativo (pickup de fila em andamento), aceita automaticamente.
- `acceptIncomingCall(call)` → `call.accept()`, seta `direction:"inbound"`, `isOnCall=true`, insere linha inbound e liga o handler de `disconnect`.
- `rejectIncomingCall(call)` → grava `status:"no-answer"` e `call.reject()`.

---

## 7. Ring-all (toque simultâneo)

`supabase/functions/voice-ring-all/index.ts`: detecta a `business_unit` pelo número (via `_shared/market-detection.ts`), lê `call_ring_settings` (nível 1, ativo, casando `business_unit`), busca `app_users` elegíveis (`is_dnd=false`, `active`, com `twilio_phone_number`) e devolve TwiML com **todos** os agentes num único `<Dial>`:

```xml
<Dial timeout="{settings.timeout_seconds}" action=".../voice-ring-all/status">
  <Client>{auth_user_id_1}</Client>
  <Client>{auth_user_id_2}</Client>
  ...
</Dial>
```

Quem atender primeiro fica com a chamada. Configuração de quem toca fica em `src/components/calls/CallRingSettingsPanel.tsx` + `useCallRingSettings`, por `business_unit` (`'br'`/`'us'`).

---

## 8. Controles em chamada

UI: `src/components/ActiveCallModal.tsx` (3 modos: widget flutuante minimizado, fullscreen mobile, dialog desktop). Ações via `useTwilio()`:

| Ação | Implementação (`TwilioContext.tsx`) |
|---|---|
| Mutar | `toggleMute()` → `currentCall.mute(!isMuted)` |
| DTMF | `sendDtmf(digit)` → `currentCall.sendDigits(digit)` |
| Desligar | `hangUp()` → `currentCall.disconnect()` |
| Espera (park) | `holdCall()` / `resumeCall()` → `queue-control` (ver §9) |
| Notas | textarea salva em `calls.notes` (array JSON) ao fechar |

Além disso: timer de duração, banner de "cliente em espera" com botão de transferir, detecção de _instant disconnect_ (<3s).

---

## 9. Transferência de ligação (o coração)

> **Atenção — há duas implementações no código, só uma está ligada.**
>
> - ✅ **Transferência cold via Queue (`queue-control` + `ConsultantDialer`)** — **é a que funciona e está em produção.** Replique esta.
> - 🚫 **Transferência clássica warm/cold via conferência (`twilio-transfer-call` + `TransferCallModal`)** — está **totalmente implementada mas desligada na UI**. `transferCall()` no contexto só emite um toast "Funcionalidade de transferência desabilitada". Documentada em §9.4 como referência da abordagem por conferência, mas **não é o caminho vivo**.

### 9.1 Fluxo real na UI (o que o atendente clica)

```
1. Em chamada com o cliente
2. Clica "Espera"  ──►  holdCall()  ──►  cliente vai pra fila com música
   (aparece o ParkedClientBanner amarelo no topo: "Retomar" | "Transferir")
3. Clica "Transferir"  ──►  abre ConsultantDialer
4. Liga pro consultor (makeConsultantCall) OU toca todos (makeRingAllCall)
   → conversa privada SDR ↔ consultor, cliente segue na espera
5. Clica "Transferir Cliente"  ──►  transferParkedToConsultant()
   → consultor é conectado ao cliente, SDR sai naturalmente
```

Componentes: `ParkedClientBanner.tsx` (banner global), `ConsultantDialer.tsx` (seletor + botões). O consultor-alvo vem de `useAppUsers()` (filtra `active`, precisa ter `twilio_phone_number`); DND via `useDndStatus`.

### 9.2 O mecanismo por baixo — cold transfer mediado por Queue

Tudo em `supabase/functions/queue-control/index.ts`. Quatro ações. **Não é conferência — é fila (Enqueue/Queue) com redirect.**

**Passo A — `action:"park"`** (coloca o cliente em espera)

Resolve a **perna PSTN do cliente** = `calls.twilio_dial_call_sid` (o filho do `<Dial>`), com fallback de busca de child-call no Twilio (`?ParentCallSid={callSid}&Status=in-progress`). Faz **REST redirect dessa perna** para uma fila com música:

```xml
<Response>
  <Say language="pt-BR">Um momento, por favor.</Say>
  <Enqueue waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.ambient">park-{callSid}</Enqueue>
</Response>
```

Nome da fila = `park-{callSid}`. Grava em `calls.metadata`: `parked`, `parked_queue`, `customer_call_sid` e **`transfer_pending: true`** (para os webhooks de status não fecharem a chamada quando a perna do SDR cair). Retorna `{ queueName, customerCallSid }`. No front, `holdCall()` seta `isParked=true`, guarda `parkedCallInfo`, espera 1,5s e **desconecta a perna do SDR** — `isParkedRef` impede o handler de `disconnect` de finalizar a linha no banco.

**Passo B — `action:"transfer"`** (o handoff de fato)

O front chama com o SID da própria perna WebRTC do SDR:

```js
{ action:"transfer", queueName: parkedQueue, targetUserId: consultantUserId,
  callRecordId, consultantCallSid: currentCall.parameters.CallSid, customerCallSid }
```

O backend:
1. Valida que a perna do cliente ainda está `in-progress/ringing/queued`; se não, marca `completed` e retorna **HTTP 409 `CUSTOMER_DISCONNECTED`** (o front mostra "Cliente desligou…" e limpa o estado de park).
2. **`resolveLeafLeg()`** — anda pela árvore de child-calls (`?ParentCallSid=...`, profundidade até 4) para achar a **perna-folha real do consultor** (o SID passado é o pai/SDR, não serve).
3. Seta `metadata.transfer_pending=true` + `consultant_leg_sid`/`sdr_leg_sid` **antes** do redirect.
4. **REST redirect da perna do consultor** para dentro da fila do cliente:

```xml
<Response>
  <Say language="pt-BR">Conectando você ao cliente.</Say>
  <Dial answerOnBridge="true">
    <Queue>{queueName}</Queue>
  </Dial>
</Response>
```

O pulo do gato: ao redirecionar a perna do consultor para a fila, o Twilio **(a) desmancha sozinho a ponte SDR↔consultor** (o SDK do SDR recebe um `disconnect` natural) e **(b) faz o dequeue do cliente**, conectando consultor↔cliente. Atualiza `calls`: `transferred_at`, `transfer_type='cold'`, `transferred_by`, `transferred_to`.

**Passo C — `action:"pickup"`** (SDR retoma um cliente em espera)

**Origina uma chamada nova** via REST: `From: TWILIO_PHONE_NUMBER`, `To: client:{agentIdentity}`, TwiML inline `<Dial><Queue>{queueName}</Queue></Dial>` (faz o dequeue do cliente para o agente).

**Passo D — `action:"transfer-ring-all"`** (transferir tocando todos)

Chama `voice-ring-all` para montar o TwiML multi-`<Client>` e **REST-redireciona a própria perna do cliente** para esse TwiML. Seta `status='transferring'`, `metadata.transfer_type='ring_all'`.

### 9.3 ⚠️ Regras que NÃO podem ser violadas (aprendidas na dor)

Estas são as decisões que fazem a transferência funcionar de forma estável. Ignorá-las é exatamente o que quebra:

- **Nunca desligue a perna do SDR manualmente** na transferência. Deixe o Twilio desfazer a ponte ao redirecionar o consultor. Desligar na mão cria uma corrida que mata o consultor antes do dequeue.
- **Nunca coloque `action`, `timeout` ou `recordingStatusCallback` no `<Dial><Queue>` da transferência.** Um `action` que devolve `<Hangup/>` derrubava o consultor. A gravação já está ativa no `<Dial>` original.
- **Identificar a perna certa é a parte difícil.** `twilio_dial_call_sid` = perna PSTN do cliente. A perna do consultor **precisa** ser resolvida descendo a árvore de `ParentCallSid` (`resolveLeafLeg`) — o SID que o front tem é o do pai/SDR.
- **Integridade da duração na transferência:** com `metadata.transfer_pending=true` + a query `segment=transfer` na perna redirecionada, o `completed` da **perna antiga** é ignorado e só o `completed` da **perna nova** fecha `ended_at`/`duration_seconds`. Sem isso, a chamada "fecha" no instante do redirect e a duração fica errada.
- **`mode=transfer-result` é um no-op proposital.** No `twilio-voice`, esse branch devolve `<Response/>` vazio. Uma versão antiga devolvia `<Hangup/>` que matava a perna do consultor quando um `<Dial><Queue>` terminava. Foi neutralizado de propósito — não "conserte" isso.

### 9.4 Warm/attended transfer via conferência (`twilio-transfer-call`) — LEGADO, desligado

Existe completo em `supabase/functions/twilio-transfer-call/index.ts` (Bearer auth), mas a UI não invoca. Guardado aqui como referência da abordagem por **conferência** (útil se um dia quiser transferência assistida de verdade). Resolve a perna PSTN do cliente (`twilio_call_sid` no inbound; `twilio_dial_call_sid` no outbound, com fallbacks) e tem 4 branches, todos via REST redirect:

- **`warm-start`** — transferência assistida real: (1) põe o cliente em hold (`<Play loop>` música); (2) move a perna WebRTC do agente para uma `<Conference>`; (3) **origina** nova chamada (`From: agente`, `To: destino`) que entra na mesma conferência → agente e destino falam **privado** enquanto o cliente espera.
- **`warm-complete`** — traz o cliente para dentro da conferência (redirect da perna do cliente para `<Dial><Conference>`). Atualiza `transferred_to/at/by`, `status='transferred'`.
- **`warm-cancel`** — aborta: reconecta o cliente ao agente (`<Dial><Client>{user.id}</Client></Dial>`).
- **`cold`** — blind transfer: redireciona a perna do cliente direto para o destino com gravação dual contínua (`segment=transfer`), `status='transferred'`, `transfer_type='cold'`.

---

## 10. Gravação

- TwiML de dial usa `record="record-from-answer-dual"` + `recordingStatusCallback` apontando para `twilio-call-webhook?callRecordId=...` (com `&segment=transfer` na perna de transferência).
- `supabase/functions/twilio-call-webhook/index.ts` em `RecordingStatus=completed`: baixa `{RecordingUrl}.mp3` (auth básica Twilio), faz upload no bucket `call-recordings` em `{callId}/{recordingSid}.mp3` (perna de transferência prefixada com `transfer-`), faz upsert em `call_recordings`.
- Se a duração ≥ 60s, dispara as funções `auto-call-summary` e `process-call-insights`.

---

## 11. Modelo de dados

**`calls`** (tabela central):
- SIDs de perna: `twilio_call_sid` (perna pai/original PSTN), `twilio_dial_call_sid` (filho do `<Dial>` = perna PSTN do cliente), `twilio_account_sid`.
- Partes/roteamento: `direction` (`inbound`/`outbound`), `from_e164`, `to_e164`, `contact_id`, `lead_id`, `handled_by_app_user_id`, `created_by`, `provider`, `channel`.
- Ciclo de vida: `status` (`initiating`/`initiated`/`ringing`/`in-progress`/`completed`/`no-answer`/`busy`/`transferred`/`transferring`), `started_at`, `ended_at`, `duration_seconds`.
- Transferência: `transferred_to`, `transferred_at`, `transferred_by`, `transfer_type` (`cold`/`ring_all`).
- `metadata` (JSONB): `transfer_pending`, `parked`, `parked_queue`, `customer_call_sid`, `consultant_leg_sid`, `sdr_leg_sid`, `transfer_type`, timestamps de transferência.
- `notes` (JSON) — notas do atendente; o `twilio-transfer-call` guarda o nome da conferência aqui.

**`call_recordings`**: `call_id`, `twilio_recording_sid` (chave de conflito), `original_url`, `storage_path`, `duration_seconds`, `format`, `size_bytes`, `fetched_at`.

**`app_users`**: `id`, **`auth_user_id`** (= identidade WebRTC), `display_name`, `twilio_phone_number`, `active`, `is_dnd`.

**`call_ring_settings`**: `level`, `active`, `business_unit`, `user_ids[]`, `timeout_seconds`.

**`contacts`** / **`leads`**: casados por `primary_phone` (exato + últimos 10 dígitos) na atribuição de inbound.

**Storage:** bucket `call-recordings`, path `{callId}/{recordingSid}.mp3`.

---

## 12. Auth & CORS

- **Funções chamadas pelo frontend** (`twilio-token`, `twilio-call`, `queue-control`, `voice-ring-all`, `twilio-transfer-call`): exigem `Authorization: Bearer <jwt>` e validam via `supabase.auth.getUser()` (algumas com service-role, outras com client anon escopado pelo header).
- **Webhooks chamados pelo Twilio** (`twilio-voice`, `twilio-call-webhook`): **sem auth** (comentário: "não requer autenticação pois vem do Twilio"), usam service-role.
  - ⚠️ **Ponto de atenção para replicar:** o divus **não valida a assinatura `X-Twilio-Signature`** nesses webhooks. Ao reimplementar, considere adicionar validação de assinatura — os endpoints são públicos.
- **CORS:** todas as funções respondem `OPTIONS` e usam:
  ```
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type, baggage, sentry-trace
  ```

---

## 13. Checklist de replicação (resumo)

1. **Token:** edge function autenticada que emite JWT WebRTC com `identity = user id`, grants `outgoing(application_sid)` + `incoming(allow)`.
2. **Device no browser:** `@twilio/voice-sdk`, mount lazy pós-auth, ciclo de eventos com refresh de token e auto-registro.
3. **TwiML App única** (`twilio-voice`) roteando por query params — outbound `<Dial>{number}`, inbound `<Dial><Client>{id}`, park/resume, ring-all.
4. **Controle ao vivo** sempre por `POST /Calls/{Sid}.json` com `Twiml=` inline.
5. **Transferência = park + cold via Queue**, não conferência:
   - park → `<Enqueue waitUrl=holdmusic>park-{sid}`;
   - resolver a **perna-folha** do consultor por `ParentCallSid`;
   - redirecionar o consultor para `<Dial answerOnBridge="true"><Queue>` — deixa o Twilio desfazer a ponte e dequeue;
   - **não** desligar SDR na mão; **não** pôr `action`/`timeout` no `<Dial><Queue>`.
6. **Integridade de duração** com `transfer_pending` + `segment=transfer`.
7. **Gravação** dual, download com basic auth, upload em storage, pós-processamento se ≥60s.
