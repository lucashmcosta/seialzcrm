# Plano: silenciar recorrência `UnhandledRejection undefined` do Twilio Voice

## Diagnóstico confirmado

- **Módulos afetados:** observabilidade frontend/Sentry e Twilio Voice WebRTC.
- **Documentação consultada:** `docs/README.md`, `docs/STATUS.md`, `docs/integrations/voice-twilio/README.md`, `docs/platform/observability/README.md`.
- **ADR aplicável:** nenhum ADR específico para este filtro; regra geral de não misturar domínios e preservar isolamento do Voice em rotas admin continua válida.
- **Não toca:** banco, RLS, Edge Functions, integrações externas ou multi-tenancy.

Pelo evento anexado, o erro final é `UnhandledRejection` com `Non-Error promise rejection captured with value: undefined`, precedido por vários breadcrumbs/logs do Twilio Voice: `WSTransport`, websocket close `1006`, `UnknownError 31000` e `ConnectionError 31005`. Isso confirma que a recorrência ainda é o mesmo ruído do SDK WebRTC/Twilio durante queda/reconexão de WebSocket, não uma falha de tela do CRM.

## Por que o filtro atual pode não pegar

O filtro atual em `src/instrument.ts` só descarta esse caso quando `mechanism.type === "onunhandledrejection"` e há breadcrumb recente do Twilio. No payload exportado do Sentry, o dado visível do erro aparece como `type: "UnhandledRejection"` e `value: "Non-Error promise rejection captured with value: undefined"`; se o evento chegar sem `mechanism.type` preenchido, ou com a classificação em `exception.type`, a condição atual não passa mesmo com os breadcrumbs do Twilio presentes.

## Ajuste proposto

1. Manter o filtro restrito ao caso seguro: rejeição vazia/undefined + evidência recente de Twilio Voice.
2. Ampliar a detecção de “unhandled rejection” para aceitar também `exception.type === "UnhandledRejection"`, além de `mechanism.type === "onunhandledrejection"`.
3. Preservar a exigência de correlação com Twilio (`TwilioVoice`, `WSTransport`, `voice-sdk`, `twilio`, `pstream`) para não esconder erros genéricos do app.
4. Se necessário, ampliar a janela dos breadcrumbs recentes de 15 para 30 entradas, porque o evento anexado tem uma sequência longa de logs antes da exceção final.

## Validação

- Conferir que o matcher cobre o texto exato do evento anexado.
- Garantir que outros `UnhandledRejection undefined` sem breadcrumb Twilio continuem indo para o Sentry.
- Não alterar comportamento de chamadas; somente filtragem de telemetria.
