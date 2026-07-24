# Fast-path stale chunk reload

Ajustar `retryImport` em `src/App.tsx` para tratar chunks stale imediatamente, sem retentativas inúteis contra 404 da CDN.

## Mudança única

Em `src/App.tsx`, substituir o corpo de `retryImport`:

```ts
function retryImport<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  return fn().catch((err) => {
    // Stale chunk → reload direto, sem retry contra 404.
    if (isStaleChunkError(err)) {
      reloadForChunkRecovery();
      return new Promise<T>(() => {}); // suspende até o reload
    }
    if (retries > 0) {
      return new Promise<T>((resolve) =>
        setTimeout(() => resolve(retryImport(fn, retries - 1)), 1000)
      );
    }
    throw err;
  });
}
```

## Comportamento resultante

- Chunk stale (pós-deploy): reload em <100ms, sem 2s de latência, sem erro no `ErrorBoundary`, sem evento no Sentry.
- Erro transitório de rede: mantém 2 retries com 1s de backoff (comportamento atual).
- Throttle de 10s bloqueou o reload: promise fica pendente; o reload já agendado pelo primeiro chunk stale vai chegar.

## Fora de escopo

Nenhuma outra alteração: `SentryFallback`, `beforeSend`, hooks, rotas, e os 61 `retryImport` chamados permanecem intactos.
