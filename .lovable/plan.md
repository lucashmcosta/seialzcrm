## Diagnóstico

O evento novo veio do bundle atual `index-CCFIdsy1.js` (não é ruído do bundle antigo) e a mensagem é a variante Safari/WebKit:

```
TypeError: undefined is not an object (evaluating 'e._result.default')
```

Isso é exatamente a mesma classe de erro que já tratamos (React.lazy tentando ler `.default` de um payload interno vazio após um chunk resolver "sujo"), mas o WebKit formata a mensagem com o receiver minificado `e._result.default` em vez de `default` puro. O `isStaleChunkError` em `src/App.tsx` (linhas 45–50) cobre três variantes:

- `cannot read properties of undefined (reading 'default')` (Chrome/V8)
- `cannot read property 'default' of undefined` (versões antigas)
- `undefined is not an object (evaluating 'default')` (WebKit — sem propriedade encadeada)

Nenhuma delas casa com `evaluating 'e._result.default'` porque:

1. A substring é `_result.default`, não `default` isolado.
2. O regex do matcher usa `includes` exato, então a presença de `e._result.` antes de `default` derruba o match.

Resultado: o `lazyWithRetry` faz o import, o payload chega vazio, o React.lazy joga o `TypeError` dentro de `mountLazyComponent`, o `retryImport.catch` até é chamado — mas `isStaleChunkError` retorna `false` para essa string, então o erro sobe para a `Sentry.ErrorBoundary` raiz em vez de acionar `reloadForChunkRecovery()`. A tela branca com "algo deu errado" aparece e o Sentry loga o evento.

Notei também que essa mesma frame do stack (`_re` no bundle atual) é o próprio `mountLazyComponent` compilado — confirma que o payload já passou pelo `lazyWithRetry` mas o React ainda vê um estado interno inválido no momento do render. A recuperação correta continua sendo o reload silencioso (o payload não vai se materializar sem um novo fetch do chunk).

## Ação (build mode)

Uma alteração pequena e cirúrgica em `src/App.tsx`:

- No array `isStaleChunkError` (linhas ~33–50), adicionar dois matchers Safari-friendly:
  - `"_result.default"` — pega qualquer mensagem WebKit que referencie o slot interno do lazy, presente/futura.
  - `"evaluating '_result"` — cinto+suspensório para variações em que o minifier trocar o nome do receiver.

Nada mais muda. `lazyWithRetry`, `retryImport`, `reloadForChunkRecovery`, o listener global `unhandledrejection` no `main.tsx` e o `SentryFallback` já reagem corretamente assim que a mensagem for classificada como stale. O `SentryFallback` continua tendo o mesmo matcher via re-export.

## Validação

1. `bun run typecheck` (o próprio harness roda) — nenhum tipo afetado.
2. `rg "_result\\.default" src/` — confirmar que a string aparece só em `isStaleChunkError`.
3. Após deploy, no Sentry: novos eventos com essa exata mensagem devem parar de aparecer; se ainda surgir algo, o breadcrumb `module_missing_export` (adicionado em `lazyWithRetry`) mostrará qual chunk chegou vazio para investigação individual.
4. Marcar o issue reaberto como "Resolved in next release".

## Fora de escopo

- Não vou revisitar `retryImport`, `lazyWithRetry`, o listener em `main.tsx` nem o `SentryFallback`: eles continuam corretos, o único defeito é o classificador de mensagem.
- Não vou tocar em rotas, providers, Twilio boundary ou `useVersionCheck`.
- Não vou adicionar novos filtros no Sentry (`instrument.ts`) — preferimos que a recuperação silencie o erro na origem em vez de mascarar no transporte.
