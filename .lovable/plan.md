## Diagnóstico

O erro `TypeError: Importing a module script failed.` chega à `Sentry.ErrorBoundary` raiz vindo do subtree do `GlobalCallHandler` (`InboundCallHandler` + `OutboundCallHandler`, que carregam o Twilio Voice SDK).

Cadeia observada nos breadcrumbs:
1. Voice integration está **desligada** para a org (`[OutboundCall] Voice integration not enabled, skipping device initialization`).
2. Ainda assim o bundle lazy do Twilio é carregado, e o SDK dispara 15 requisições para `sdk.twilio.com/.../sounds/*.mp3` — todas com `status_code: 0` (bloqueadas por rede/CSP/adblock/Safari ITP).
3. Em seguida o SDK faz um `import()` interno (worker/áudio) que falha com "Importing a module script failed".
4. Esse `import()` **não passa pelo nosso `retryImport`/`lazyWithRetry`**, então a rejeição escapa da rede de recuperação, sobe pelo Suspense e é capturada pela `ErrorBoundary`, resultando em tela branca.

O padrão `"importing a module script failed"` já existe em `isStaleChunkError`, mas ele só é consultado (a) dentro do `retryImport` dos nossos lazies e (b) nos handlers globais `window.error` / `unhandledrejection` de `main.tsx`. Neste caso a falha é rethrown durante o render do subtree do call handler (não como unhandled rejection), então nem `main.tsx` nem `retryImport` a interceptam.

## Correção proposta

Isolar o subtree dos call handlers atrás de um error boundary próprio que trate erros de import como ruído silencioso — os handlers são não-essenciais (só ativos quando voice está habilitado), então não faz sentido derrubar o app inteiro quando o SDK do Twilio falha ao carregar assets/módulos.

### Passos

1. **Novo componente `src/components/calls/CallHandlersBoundary.tsx`**
   - Class component `React.Component` com `componentDidCatch`.
   - Se `isStaleChunkError(error)` for verdadeiro → chama `reloadForChunkRecovery()` e renderiza `null` (silencia).
   - Se for erro do Twilio SDK (heurística: `error.stack` contém `twilio` OU `error.message` inclui algum dos padrões abaixo) → renderiza `null` + `Sentry.addBreadcrumb` (sem `captureException`, é ruído esperado quando assets do CDN Twilio são bloqueados):
     - `"importing a module script failed"`
     - `"failed to fetch dynamically imported module"`
     - `"module script"`
   - Qualquer outro erro → rethrow (`throw error` no render) para deixar a boundary superior tratar.

2. **`src/App.tsx` — `GlobalCallHandler`**
   - Envolver o `<Suspense>` interno com `<CallHandlersBoundary>`:
     ```
     <CallHandlersBoundary>
       <Suspense fallback={null}>
         <InboundCallHandler />
         <OutboundCallHandler />
       </Suspense>
     </CallHandlersBoundary>
     ```

3. **`src/instrument.ts` — filtro adicional**
   - Estender o `beforeSend` para descartar eventos cujo `error.stack` contenha `twilio-` (arquivo de bundle do SDK) **e** `message` bata em `STALE_CHUNK_PATTERNS` — evita novos issues no Sentry para essa mesma classe.

### Fora de escopo

- Não mexer na lógica de detecção de "voice enabled" (já está correta — o problema é que o bundle é lazy-loaded antes desse check dentro dos handlers).
- Não mexer em CSP/rede para desbloquear os `.mp3` (é comportamento do usuário/rede; assets são opcionais para o SDK).
- Nenhuma migration, nenhuma alteração de business logic.

## Validação

- Typecheck.
- Confirmar que `GlobalCallHandler` continua montando normalmente para orgs com voice habilitada.
- Confirmar que, quando `isStaleChunkError` bater, o `reloadForChunkRecovery` (idempotente + throttle de 10s) ainda dispara reload.
