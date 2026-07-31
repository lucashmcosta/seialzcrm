# Recorrência: `Failed to fetch dynamically imported module` (/assets/ContactsList-*.js)

## O que foi verificado agora (read-only)

- `src/App.tsx:23-55` — `isStaleChunkError` já cobre a mensagem exata do evento.
- `src/App.tsx:86-105` — `retryImport` detecta stale chunk, chama `reloadForChunkRecovery()` e suspende (nada vaza para o ErrorBoundary) — **desde que o reload realmente aconteça**.
- `src/App.tsx:68-84` — `reloadForChunkRecovery()` faz `window.location.reload()` **sem cache-busting** e desiste (`return false`) se já houve reload nos últimos 10s.
- `src/main.tsx:12-47` — o `SentryFallback` é o único caminho que usa `hardRefreshApp()` (limpa caches + `?app-refresh=`).
- `src/instrument.ts:20-82` — `beforeSend` descarta essa mensagem. Logo, para o evento ter chegado ao Sentry, o cliente rodava um build **anterior** a esse filtro, ou o reload falhou repetidamente e o fallback foi renderizado.
- `vercel.json` — há `immutable` para `/assets/*`, mas **nenhum header explícito de cache para o HTML** (`/index.html` fica no default da Vercel).

Diagnóstico honesto: não é possível afirmar a causa única sem o `release` do evento no Sentry. Há, porém, duas lacunas reais no caminho de recuperação, independentes do release.

## Lacunas a corrigir

1. **Reload sem quebra de cache.** Se o navegador (ou uma camada intermediária) devolver o mesmo `index.html` cacheado, o reload traz outra vez os `<script src>` antigos → o import falha de novo → na segunda vez o throttle de 10s bloqueia (`false`) → o erro sobe ao ErrorBoundary → evento no Sentry. É exatamente o padrão de recorrência observado.
2. **Sem garantia de HTML não cacheado.** O `index.html` deve ser sempre revalidado, senão o passo 1 se repete.

## Mudanças propostas

1. `src/App.tsx` — em `reloadForChunkRecovery()`, trocar `window.location.reload()` por um reload com cache-busting (`?app-refresh=<ts>` via `location.replace`) e, quando disponível, limpar `caches` antes; manter o guard de sessão, mas com escalonamento: primeira tentativa = reload normal, tentativa seguinte na mesma sessão = hard refresh. Reaproveitar `hardRefreshApp()` de `src/hooks/useVersionCheck.ts` em vez de duplicar lógica.
2. `vercel.json` — adicionar header `Cache-Control: public, max-age=0, must-revalidate` (ou `no-store`) para `/` e `/index.html`, garantindo que o HTML nunca sirva referências de assets vencidas.
3. `src/instrument.ts` — alinhar o filtro do `beforeSend` com todos os matchers de `isStaleChunkError` (hoje faltam as variantes `_result.default` / `evaluating '_result` / `cannot read properties of undefined (reading 'default')`), para que a mesma classe de erro nunca gere issue.
4. `docs/operations/drift/` — registrar a nota da recorrência e o ajuste (sem criar nova estrutura de docs).

## Fora de escopo

Nenhuma migration, nenhuma mudança de rota/SPA fallback (deep links continuam pelo rewrite atual), nenhuma alteração de negócio.

## Validação

- `bun run build` verde.
- Conferir no Sentry, após o próximo deploy, se novos eventos dessa issue trazem `release` igual ao deploy atual; se continuarem com release antigo, é cauda de abas velhas e a issue pode ser resolvida.
