## Diagnóstico

O evento reaberto no Sentry vem do bundle publicado `index-DKXK1q1n.js` — os frames apontam código minificado do bundle antigo, não do source atual. A navegação foi `/contacts/33196888… → /commercial?thread=2f264b51…`, ou seja, o React tentou montar o `MessagesList` (rota `/commercial`) via `React.lazy`, o módulo do chunk resolveu sem `default`, e `mountLazyComponent` estourou `Cannot read properties of undefined (reading 'default')` — exatamente a variante de stale chunk que já mapeamos.

Estado do código atual (`src/App.tsx`, verificado agora):
- `isStaleChunkError` **já inclui** os padrões `"cannot read properties of undefined (reading 'default')"`, `"cannot read property 'default' of undefined"` e `"undefined is not an object (evaluating 'default')"` (linhas 47–49).
- `lazyWithRetry` **já valida** o export após o import: quando `mod[exportName]` é `undefined`, ele emite breadcrumb Sentry `module_missing_export` com o nome do módulo, dispara `reloadForChunkRecovery()` e devolve uma promise pendente — a `Sentry.ErrorBoundary` raiz nunca deveria ver o `TypeError`.
- Todos os `lazy()` de rotas relevantes (incluindo `MessagesList`, `ContactDetail`, `OpportunityDetail`, `InboxPage`) estão migrados para `lazyWithRetry` (linhas 177–251).

Ou seja: **a proteção já está no repositório**; o evento reaberto foi emitido pelo bundle `index-DKXK1q1n.js`, que é anterior ao deploy dessa proteção. Como o Sentry reabre issues automaticamente quando um evento novo bate no mesmo fingerprint, ele reabriu com base num cliente ainda rodando o bundle velho.

## Ação proposta (sem código)

1. **Confirmar release do evento reaberto.** No próprio issue do Sentry, checar `release` / `dist` do evento (não visível na mensagem colada). Se for anterior ao deploy que introduziu `lazyWithRetry` + os novos matchers em `isStaleChunkError`, é ruído esperado de cliente antigo — resolver novamente marcando "resolved in next release".
2. **Verificar breadcrumb `module_missing_export`.** Se o evento for do bundle NOVO, ele deve trazer um breadcrumb `category: "lazy"`, `message: "module_missing_export"` com `data.name` apontando qual chunk chegou sem export. Sem esse breadcrumb, o cliente é do bundle antigo (caso 1). Com o breadcrumb, temos o nome do módulo para investigar por que o CDN serviu um chunk vazio.
3. **Regra de fingerprint no Sentry (opcional, ainda no console).** Adicionar uma inbound filter / fingerprint override para `TypeError: Cannot read properties of undefined (reading 'default')` cujo stack contenha `mountLazyComponent`, agrupando por release. Isso impede que clientes em builds antigos continuem reabrindo o issue já resolvido no build atual.

Sem alterações de código: as três guardas (`isStaleChunkError`, `retryImport`, `lazyWithRetry`) já cobrem este caso e o novo build irá silenciar automaticamente. Só faz sentido mexer em código se o passo 2 mostrar um breadcrumb `module_missing_export` — aí investigamos o chunk específico.

## Validação

- Abrir o issue reaberto no Sentry e olhar `release`/`dist` do último evento vs. release atual em produção.
- Confirmar (ou não) a presença do breadcrumb `module_missing_export` no evento.
- Após confirmar que os eventos remanescentes são todos do bundle antigo, marcar como "Resolved in next release".