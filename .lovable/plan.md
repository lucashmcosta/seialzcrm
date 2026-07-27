## Diagnóstico

O evento do Sentry é `UnhandledRejection: Non-Error promise rejection captured with value: undefined`. Nos breadcrumbs imediatamente anteriores há a sequência típica do Twilio Voice SDK reconectando:

- WebSocket fecha com código 1006 → `ConnectionError (31005)` / `AccessTokenExpired (20104)`
- Device emite `#error` / `#unregistered` e o `WSTransport` reinicia com backoff

O Voice SDK, em alguns caminhos internos de reconexão/register, rejeita uma promise sem valor (`Promise.reject()` cru), o que o Sentry captura como `value: undefined`. Isso é ruído benigno — a reconexão logo em seguida tem sucesso (`WebSocket opened successfully` / `#registered` / `Twilio Device registered and ready` nos logs).

Os filtros atuais em `src/instrument.ts` (`beforeSend`) não pegam este caso porque todos dependem de inspecionar strings em `firstException.value` — que aqui é `undefined`.

## Escopo da correção (somente `src/instrument.ts`)

Adicionar mais um branch no `beforeSend` para descartar somente esta combinação estrita:

- `event.exception.values[0].value` é ausente/undefined **ou** a mensagem contém "Non-Error promise rejection captured with value: undefined"
- **E** `mechanism.type === "onunhandledrejection"`
- **E** existe pelo menos um breadcrumb recente (últimos ~15) cuja mensagem contenha `TwilioVoice` ou cujo arquivo/logger indique o SDK

A conjunção das três condições garante que só suprimimos rejeições vazias correlacionadas a atividade do Twilio Voice SDK — qualquer `unhandledrejection` de outra origem continua sendo reportado.

## Fora do escopo

- Não mexer em `useInboundCalls.ts` nem em nenhum código de chamada — os erros funcionais (31005/20104) já são tratados e a reconexão funciona.
- Não alterar UI, rotas, provider Voice, tokens, ou lógica de negócio.
- Não adicionar retry/handler novo no Device — o SDK já reconecta sozinho.

## Validação

- Verificar em `src/instrument.ts` que apenas o novo bloco foi acrescentado e retorna `null` só quando as três condições batem.
- Confirmar no Sentry, após deploy, que o issue `Non-Error promise rejection captured with value: undefined` deixa de aparecer enquanto outras rejeições continuam sendo capturadas.
