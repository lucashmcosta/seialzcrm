## Objetivo
Criar `docs/MOBILE_CALLS.md` — documento único, técnico, respondendo exatamente as 7 perguntas feitas, com base no código real (não em suposições).

## Fontes já verificadas
- `src/contexts/OutboundCallContext.tsx` (761 linhas), `src/hooks/useInboundCalls.ts` — usam `@twilio/voice-sdk` (`new Device(token)`, import dinâmico). **Confirmado: WebRTC no browser, não bridge.**
- `supabase/functions/twilio-token/index.ts` — gera Access Token JWT do Twilio.
- `supabase/functions/twilio-call/index.ts` — existe como REST originate paralelo (usado provavelmente por click-to-call server-side, não pelo botão "Ligar" atual).
- `supabase/functions/twilio-webhook/index.ts` — recebe status/TwiML/recording.
- `src/components/contacts/ContactCalls.tsx` — botões Ligar/Agendar/Registrar, filtros, form.
- `src/components/calls/ScheduleCallDialog.tsx` — cria row em `calls` (status=`queued`, call_type=`scheduled`) **e** uma `task` de lembrete. **Não dispara ligação automática.**
- `src/components/calls/{ActiveCallModal,OutboundCallModal,IncomingCallModal,MinimizedCallWidget,DialPad,CallRecordingPlayer}.tsx` — UI de chamada ativa existe (mute, encerrar, DTMF, minimizar, player de gravação).
- Schema `public.calls` (20 colunas) e `public.call_recordings` (9 colunas) lidos do banco.
- Valores reais de `status` em produção: `queued`, `ringing`, `in-progress`, `completed`, `no-answer`, `busy`, `failed`. `direction`: `outgoing`, `incoming`.
- RLS: policy `ALL` `user_has_org_access(organization_id)` em ambas — **sem restrição "só minhas ligações"**. Todos da org veem tudo.
- `usePermissions.ts` / `docs/product/permissions-overview.md` — **nenhuma permission key específica de chamadas** (gating hoje é só `hasVoiceIntegration`).

## Conteúdo do doc (seções)

1. **TL;DR para o mobile** — 3 linhas: é WebRTC embutido, não bridge; replicar 1:1 no mobile exige SDK nativo Twilio Voice (`@twilio/voice-react-native` ou `twilio-voice-ios/android` via Capacitor plugin) + CallKit/ConnectionService; alternativa pragmática = usar `tel:` do dispositivo + registro manual, ou implementar bridge server-side novo.

2. **Mecanismo real do "Ligar" (web hoje)**
   - Fluxo passo a passo: `startCall()` → `twilio-token` (JWT) → `new Device(token)` dinâmico → `device.connect({ params: { To, contactId, opportunityId, userId } })` → TwiML App aponta pra `twilio-webhook/twiml` → `<Dial>` do número do contato.
   - Microfone do rep = endpoint da chamada. Sem PSTN no lado do rep.
   - Contraste com bridge (o que **não** é): não há chamada telefônica pro celular do rep.
   - Implicação mobile: opções A/B/C detalhadas (SDK nativo, bridge novo, `tel:` fallback), com trade-offs.

3. **Schema completo `public.calls`** — tabela markdown com todas as 20 colunas, tipo, nullable, default e observação de uso:
   - `id, organization_id, contact_id, opportunity_id, user_id` (= owner/responsável, FK → `public.users.id`), `direction (outgoing|incoming)`, `status`, `call_type (made|received|scheduled)`, `call_sid` (Twilio), `from_number, to_number`, `started_at, answered_at, ended_at, scheduled_at`, `duration_seconds, notes, is_sample, deleted_at, created_at`.
   - Enum de `status` (7 valores confirmados no banco).
   - Sem coluna `disposition` (motivo de não atendimento é derivado de `status`).
   - Schema `public.call_recordings` (9 colunas) + relação 1:N com `calls`.

4. **Fluxo do botão "Ligar" — o que o mobile precisa saber**
   - Não há resposta síncrona com resultado da chamada. `calls.status` é atualizado pelo webhook `twilio-webhook/status` (eventos `initiated/ringing/answered/completed`).
   - Duração e `ended_at` gravados no evento `completed`.
   - Gravação (se `enable_recording`) chega em `twilio-webhook/recording` → insere em `call_recordings`.
   - **Mobile precisa realtime OU polling** em `calls` filtrado por `call_sid`/`id`. Recomendação: Realtime (channel `calls` filtrado por `organization_id`) — já autorizado pela RLS existente.

5. **Fluxo "Agendar"** — cria `calls` (`status=queued, call_type=scheduled, scheduled_at`) + `tasks` (`task_type=call, due_at=scheduled_at`). **Não dispara ligação automática** — é lembrete. No horário o rep aperta "Ligar agora" (botão condicional já existe no card).

6. **Fluxo "Registrar"** — form manual com 4 campos: `direction` (outgoing|incoming), `status` (completed|no-answer|busy|failed — subset), `duration_seconds` (int, opcional), `notes` (text). Insert direto em `calls` + `activities` (activity_type=`call`). Sem `call_sid`, sem `from/to_number`.

7. **Permissions & visibilidade**
   - Não existe permission key `can_view_calls` / `can_manage_calls` no projeto.
   - Gating de UI = `useVoiceIntegration().hasVoiceIntegration` (existência de `organization_integrations` com slug `twilio-voice` ativo).
   - RLS = qualquer membro da org vê todas as chamadas (sem regra "só minhas"). Se o mobile quiser esse recorte, é filtro client-side por `user_id = userProfile.id`.

8. **Filtros "Todas / Feitas / Recebidas / Agendadas"** — lógica exata do web (linhas 157-163 de `ContactCalls.tsx`), baseada em `call_type` primeiro e `direction` como fallback:
   - Feitas: `call_type='made'` OU (`direction='outgoing'` e `call_type≠'scheduled'`)
   - Recebidas: `call_type='received'` OU `direction='incoming'`
   - Agendadas: `call_type='scheduled'`
   - Não há campo dedicado tipo `is_scheduled`.

9. **UI de chamada ativa & gravação**
   - Componentes existentes: `OutboundCallModal` (mute, DTMF/dial pad, minimizar, encerrar, timer), `MinimizedCallWidget` (bolha flutuante), `IncomingCallModal` (aceitar/recusar), `ActiveCallModal` (variante 463 linhas), `CallRecordingPlayer` (player áudio nas gravações — aparece dentro de cada card de chamada quando há `call_recordings`).
   - Estados do `CallStatus`: `initializing, ready, connecting, ringing, connected, ended, failed`.
   - Se optar por SDK nativo no mobile, replicar esses estados + mute/DTMF/end. Se optar por `tel:`/bridge, essa tela some (SO cuida).

10. **Recomendação final para o mobile** (parágrafo curto)
    - Fase 1: implementar listagem, filtros, "Registrar" e "Agendar" (todos são só INSERT/SELECT — funcionam idênticos ao web).
    - Fase 1: botão "Ligar" abre `tel:<número>` do dispositivo + prompt "Registrar essa ligação?" no retorno.
    - Fase 2 (se desejado): Capacitor plugin com Twilio Voice SDK nativo + CallKit/ConnectionService — projeto de porte.

## Escopo estrito
- Apenas cria `docs/MOBILE_CALLS.md`.
- Não altera código, não mexe em migrations, não toca UI existente.
- Não implementa nada do módulo mobile — é doc.