## Diagnóstico

O erro `TypeError: undefined is not an object (evaluating 't.close')` reportado no Sentry vem do vendor `encoderWorker.umd-BU_-OxzJ.js` (o worker do `opus-media-recorder`). É o mesmo bug de race no warmup que já tratamos: o worker chama `encoder.close()` antes de a WASM alocar o encoder. Nada no fluxo real de gravação depende disso — o AudioRecorder já:

- Faz `warmEncoder` best-effort e só chama `stop()` se recebeu chunk.
- Envolve o Worker com `createSilencedEncoderWorker`, que faz `preventDefault`/`stopImmediatePropagation` no `error` do worker.

Ou seja, no runtime o usuário não vê nada — o ruído está só no Sentry.

## Por que o filtro atual não pegou

Em `src/instrument.ts` (linhas 86-95) já existe um `beforeSend` que descarta o crash, mas com dois predicados AND:

1. `filename.includes("encoderWorker.umd.js")` — no bundle atual o arquivo vem com hash (`encoderWorker.umd-BU_-OxzJ.js`), então o `.includes("encoderWorker.umd.js")` **não bate** (falta o `.` antes do hash).
2. `mechanismType === "onerror"` — em Safari/WebKit este erro pode chegar via `generic`/`instrument` (o console mostra `Type: error, Category: exception`, sem indicação de `onerror`), então também falha.

Resultado: o evento passa pelo filtro e vira ruído no Sentry, apesar do handler local do worker no `AudioRecorder.tsx` já ter engolido o evento visualmente.

## Mudança proposta (escopo mínimo, sem tocar em UX)

Editar apenas `src/instrument.ts`, no bloco `beforeSend`:

- Trocar o match do filename para `encoderWorker.umd` (sem `.js`) e também procurar em **todos os frames**, não só no topo — hashes tipo `encoderWorker.umd-XXXX.js` continuam batendo.
- Remover a exigência de `mechanismType === "onerror"`. Em compensação, adicionar uma segunda salvaguarda pelo texto da exceção para não mascarar outros bugs em código próprio: só descarta se a mensagem casar com um dos padrões conhecidos do polyfill (`evaluating 't.close'`, `encoder.close`, `Cannot read propert(y|ies) of undefined (reading 'close')`, `undefined is not an object (evaluating 't.close')`).
- Manter tudo o resto do arquivo intacto (stale chunk, setSinkId, "Device not found: default").

Resultado: qualquer crash cujo stack passe por `encoderWorker.umd*.js` **e** cuja mensagem seja um dos padrões conhecidos de `close()` em encoder não alocado é descartado antes de ir ao Sentry. Erros fora desse vendor continuam visíveis.

## Fora de escopo

- Não alterar `AudioRecorder.tsx` — o comportamento em runtime já está correto e o usuário não vê o erro.
- Não substituir `opus-media-recorder` nem mudar warmup.
- Não mexer em nenhum filtro Sentry existente (stale chunk, Twilio setSinkId, default device).

## Validação

Após aplicar:
1. Confirmar via `rg` que só `src/instrument.ts` foi tocado.
2. No próximo deploy, checar no Sentry se o issue de `t.close` para de receber novos eventos (o handler local já silencia no console, então não há verificação visual — a evidência é a ausência do issue novo).
