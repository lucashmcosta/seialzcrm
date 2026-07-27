## Contexto

Sentry captura:

```
InvalidArgumentError: Device not found: default
  at we.<anonymous> (/assets/twilio-*.js)
```

Stack aponta 100% para dentro do bundle do `@twilio/voice-sdk`. Nenhum código em `src/` chama `setInputDevice`, `setSinkId` ou toca `MediaDevices` — `rg` confirmou. O erro dispara ~3s depois de `[SDK] Call disconnected`, sem afetar chamadas: pelos próprios logs do console fornecidos, a chamada anterior completou (`status: completed`, `duration_seconds: 26`) e a próxima reinicializou o Device normalmente.

Causa: o `AudioHelper` interno do Twilio Voice SDK reavalia o `inputDevice` no teardown; se o dispositivo rotulado `"default"` some momentaneamente (troca de fone, driver piscando, permissão revalidada) ele rejeita com `InvalidArgumentError: Device not found: default` como `unhandledrejection`. É ruído benigno.

Já existe precedente no projeto para silenciar ruído benigno do próprio Twilio SDK dentro do `beforeSend` (bloco atual de `setSinkId`, linhas 97–125 de `src/instrument.ts`).

## Mudança

Editar somente `src/instrument.ts`, adicionando **um novo predicado** dentro do `beforeSend` existente, seguindo exatamente o mesmo padrão estrito do filtro de `setSinkId` já em produção.

O novo bloco descarta o evento se e somente se **todas** as condições forem verdadeiras:

1. `firstException.type === "InvalidArgumentError"`
2. `firstException.value` casa `/device not found:\s*default/i`
3. **E** alguma das duas:
   - Algum frame do stack tem `filename` contendo `twilio` ou `voice-sdk`, **ou**
   - `mechanism.type === "onunhandledrejection"`

Qualquer `InvalidArgumentError` disparado por código nosso continua reportado — nossos frames não têm `twilio`/`voice-sdk` no filename e não vêm por `onunhandledrejection`.

## Não vou mexer (segurança do fluxo Twilio)

- `src/contexts/OutboundCallContext.tsx` — intocado. O ciclo de vida do Device continua o mesmo.
- `src/hooks/useInboundCalls.ts` — intocado.
- `@twilio/voice-sdk` — sem bump de versão.
- Nenhuma edge function, migration, RLS, UI ou breadcrumb muda.

O filtro é 100% client-side no cliente Sentry; ele apenas descarta o *evento* de telemetria antes de enviar, não altera runtime nem lógica de chamada.

## Validação

1. Discar → tocar → atender → desligar continua funcionando (comportamento idêntico ao atual, código do fluxo Twilio não muda).
2. Após deploy, o issue `InvalidArgumentError: Device not found: default` no Sentry para de receber eventos novos.
3. Se surgir um `InvalidArgumentError` diferente (mensagem outra, ou originado fora de frames Twilio e sem ser unhandledrejection), ele continua sendo capturado.
