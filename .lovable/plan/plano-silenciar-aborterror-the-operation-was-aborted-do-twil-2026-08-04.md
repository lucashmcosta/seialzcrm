# Plano: silenciar `AbortError: The operation was aborted.` do Twilio Insights

## Diagnóstico

O evento do Sentry é `AbortError: The operation was aborted.`, sem stack de código da aplicação. Os breadcrumbs imediatamente anteriores mostram:

- dezenas de `POST https://eventgw.us1.twilio.com/v4/EndpointEvents` e `/v4/EndpointMetrics` (telemetria do Twilio Voice SDK);
- um `fetch` com `level: error` para `/v4/EndpointMetrics` sem status;
- o log do próprio SDK: `[TwilioVoice][EventPublisher] Unable to post quality-metrics-samples metrics-sample event to Insights. Received error: TypeError: Load failed`;
- em seguida `[SDK] Call disconnected` e o `PATCH` em `calls` gravando `status: completed` com `duration_seconds: 80`.

Ou seja: a chamada funcionou de ponta a ponta e foi encerrada normalmente. O `AbortError` é o envio de métricas de qualidade (Insights) do `EventPublisher` do `@twilio/voice-sdk` sendo cancelado quando o `Device`/`Call` é destruído no fim da chamada (ou quando a rede/adblocker corta o request). Não afeta áudio, gravação, nem persistência do registro da chamada. É a mesma família de ruído já filtrada em `src/instrument.ts` (setSinkId, `Device not found: default`, rejeições vazias durante reconexão do WSTransport).

Não toca banco, RLS, Edge Functions, integrações externas nem multi-tenancy.

## Ajuste proposto (apenas telemetria)

Um bloco adicional no `beforeSend` de `src/instrument.ts`, com predicado estrito para não esconder aborts legítimos do app:

1. `exceptionType === "AbortError"` **ou** mensagem casando `the operation was aborted` / `load failed`;
2. E correlação com o publisher do Twilio, satisfeita por **um** destes:
   - algum frame do stack em arquivo contendo `twilio` / `voice-sdk`;
   - algum breadcrumb recente (últimas ~30 entradas) referenciando `eventgw`, `endpointmetrics`, `endpointevents`, `eventpublisher` ou `twiliovoice`.

Se nenhuma dessas evidências existir, o evento continua indo para o Sentry — aborts de `fetch` do próprio CRM (Supabase, edge functions, uploads) permanecem visíveis.

## Validação

- Conferir que o matcher cobre exatamente o texto e os breadcrumbs do evento reportado.
- Garantir que um `AbortError` sem breadcrumb/frame do Twilio continue sendo enviado.
- Nenhuma mudança de comportamento de chamadas: somente filtragem de telemetria.

## Detalhes técnicos

- Arquivo único alterado: `src/instrument.ts` (bloco novo dentro de `beforeSend`, reaproveitando `firstException`, `frames`, `exceptionType`, `exceptionValue` e `event.breadcrumbs` já disponíveis no escopo).
- Sem migration, sem nova Edge Function, sem novo arquivo.
