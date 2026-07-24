# Recovery silencioso para chunk stale — análise de segurança e plano

## Diagnóstico (reconfirmado no código)

Rastro do erro do Sentry:
- Usuário clica em `/inbox` → `React.lazy(() => retryImport(() => import("./pages/inbox/InboxPage")))` em `src/App.tsx:83`.
- `import()` rejeita com `Failed to fetch dynamically imported module` (hash `Y9lwkk7P` foi substituído por deploy).
- `retryImport` (`src/App.tsx:33-41`) tenta 2× em 1s, chama `reloadForChunkRecovery()` e **re-lança** o erro.
- `reload()` é assíncrono; o throw sobe antes → `Sentry.ErrorBoundary` (`src/main.tsx:78`) captura, reporta e mostra `SentryFallback`.
- ~500ms depois o reload materializa e o usuário nem lê a mensagem — mas o Sentry já registrou.

## Auditoria de segurança da mudança proposta

Objetivo: para o caso **chunk stale + reload disparado**, `retryImport` retorna uma Promise pendente em vez de lançar. Antes de apresentar o plano final, verifiquei cada risco plausível:

### 1. Promise pendente "vaza" memória?
Não relevante. Assim que o reload dispara (`location.reload()`), a página inteira é descartada. A Promise pendente só existe pelos ~200–1000 ms entre o disparo do reload e o novo carregamento. Sem GC pressure, sem handles residuais.

### 2. E se o reload for bloqueado pelo throttle de 10s (`reloadForChunkRecovery` linha 26)?
Cenário: dois chunks falham em sequência. O segundo `reloadForChunkRecovery` retorna sem recarregar. Se nesse caso retornássemos Promise pendente, a UI ficaria com spinner **para sempre**.
Mitigação obrigatória no plano: só retornar Promise pendente quando o reload for **efetivamente disparado**. Se o throttle bloqueou, manter o `throw err` atual (ErrorBoundary continua sendo rede de segurança). Isso preserva 100% do comportamento atual no cenário degenerado.

### 3. E o `retryImport` usado por `InboundCallHandler`/`OutboundCallHandler` dentro de `<Suspense fallback={null}>` (`src/App.tsx:199-202`)?
Esses componentes ficam em Suspense com fallback `null` (não bloqueiam a UI, são side-effect handlers). Retornar Promise pendente aqui simplesmente adia a montagem deles até o reload — comportamento aceitável (a página inteira vai recarregar em <1s de qualquer forma). Sem regressão.

### 4. Erros que **não** são chunk stale (bug real de runtime)?
A mudança usa exatamente a heurística já validada em `src/hooks/useVersionCheck.ts:83-92` (`isStaleChunkError`). Se o erro não casar com o padrão, cai no `throw err` de sempre → ErrorBoundary continua reportando. Nenhum bug real é escondido.

### 5. `lazy()` sem `retryImport` (17 imports de Settings + alguns outros — vide grep)
Essas rotas hoje **não** têm retry nem reload automático. A camada 2 do plano (filtro no `Sentry.ErrorBoundary`) apenas silencia o **relatório** para chunk stale; ainda mostra `SentryFallback` porque não há reload. Isso é **estritamente melhor que hoje** (só remove ruído do Sentry) e não muda UX visível dessas rotas. Não vou envolver essas rotas em `retryImport` neste plano (fora de escopo, mudança maior).

### 6. Filtro do Sentry pode esconder erros reais?
O filtro casa apenas mensagens `Failed to fetch dynamically imported module`, `importing a module script failed`, `loading chunk`, `chunkloaderror`, `module script`. Todos são falhas de carga de asset, nunca bugs de código executado. Nenhum stack trace de lógica de app cai nesse padrão.

### 7. Isso quebra a ErrorBoundary do Sentry para outros erros?
Não. `beforeCapture` só decide se **reporta**; o fallback e a árvore React continuam iguais. Uso o hook oficial documentado do `@sentry/react`.

### 8. Impacto em SSR/build/tsgo?
Zero. `location.reload`, `Promise`, `beforeCapture` já são usados no projeto (`useVersionCheck.ts`, `main.tsx`). Sem novas dependências.

## Plano final (2 arquivos, ~20 linhas)

### `src/App.tsx`
- Adicionar helper `isStaleChunkError(err)` (idêntico ao de `useVersionCheck.ts`) OU importar do próprio hook para não duplicar.
- Fazer `reloadForChunkRecovery()` **retornar boolean** (`true` se disparou reload, `false` se throttle bloqueou).
- Ajustar `retryImport`: no `catch` final, se `isStaleChunkError(err) && reloadForChunkRecovery() === true`, retornar `new Promise(() => {})` (nunca resolve). Caso contrário, manter `throw err` como está hoje.

### `src/main.tsx`
- Passar `beforeCapture` para `Sentry.ErrorBoundary` (ou usar `Sentry.init({ beforeSend })` — vou usar `beforeCapture` no boundary, escopo menor). Se `error.message` casar com `isStaleChunkError`, não capturar. Como belt-and-suspenders, envolver `SentryFallback` para mostrar `PageLoader` em vez do texto "Algo deu errado" quando o motivo for stale — assim mesmo os `lazy()` sem `retryImport` deixam de flashar mensagem de erro.

## Verificação pós-implementação

1. `bun run build` limpo (tsgo roda automaticamente).
2. Teste manual: `bun build`, servir `dist/`, renomear `assets/InboxPage-*.js` e clicar `/inbox`. Esperado: spinner + reload silencioso, sem "Algo deu errado", sem evento no Sentry.
3. Teste negativo: forçar `throw new Error("boom")` dentro de `InboxPage` — ErrorBoundary deve continuar mostrando fallback e Sentry deve capturar.
4. Monitorar Sentry por 24-48h: taxa de `Failed to fetch dynamically imported module` deve cair a 0.

## Fora de escopo (explícito)

- Envolver os `lazy()` de Settings em `retryImport` (mudança larga, adiada).
- Prompt de "nova versão disponível" (já existe em `useVersionCheck.ts`).
- Alterar chunking do Vite, service worker, ou release naming.

Aprovar para implementar?