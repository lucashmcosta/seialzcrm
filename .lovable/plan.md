# Verificação: `InboxPage-DyhNv4IU.js` já resolvido

## Checagens feitas agora (read-only)

- `src/App.tsx:122` — `InboxPage` é carregado via `lazy(() => retryImport(() => import("./pages/inbox/InboxPage")))`. Está sob o mesmo mecanismo dos demais.
- `src/App.tsx:62-78` — `retryImport` já contém o fast-path aplicado no turno anterior: em qualquer erro que case `isStaleChunkError`, dispara `reloadForChunkRecovery()` e devolve `Promise` pendente (sem retries, sem escapar para o `ErrorBoundary`).
- `src/App.tsx:20` / `src/instrument.ts:20-34` — `STALE_CHUNK_PATTERNS` inclui `"failed to fetch dynamically imported module"`, que é exatamente a mensagem do evento.
- `src/main.tsx:12-33` — `SentryFallback` também trata stale chunk como recovery com `PageLoader`, como belt-and-suspenders.
- `src/instrument.ts:73-78` — `beforeSend` já dropa esse padrão de mensagem antes de subir pro Sentry.

## Conclusão

O evento é **mais antigo que o fast-path**. A assinatura é idêntica à do `SettingsLayout` que corrigimos no turno anterior — mesma mensagem, mesma pilha (`Tt` → `nae` → `fae` → Suspense), só muda o nome do chunk. A correção não é por-rota: `retryImport` é o único caminho de carregamento lazy e já cobre `InboxPage` explicitamente.

**Nenhuma ação necessária.** Se o mesmo erro reincidir com `hash` de bundle **posterior** ao deploy do fast-path (ver `index-*.js` do evento vs. o atual em produção), aí sim é sinal de regressão e vale investigar — nesse caso, me mande o novo evento com timestamp e eu confirmo pelo hash.

## Próximo passo sugerido

Seguir para o próximo erro do Sentry (indo do mais novo para o mais antigo, como você definiu).
