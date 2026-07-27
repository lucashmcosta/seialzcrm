## Diagnóstico

Erro: `TypeError: 'text/html' is not a valid JavaScript MIME type.` disparado logo após navegação `/inbox → /contacts/...`.

Esta é uma variante **Safari/WebKit** do mesmo padrão de **stale chunk após deploy** que já tratamos várias vezes:

- O navegador tentou baixar um chunk `lazy()` cujo hash não existe mais no CDN após o deploy novo.
- O host respondeu com o `index.html` fallback (SPA rewrite) em vez de 404.
- Safari, ao receber `Content-Type: text/html` num `import()` dinâmico, rejeita com essa mensagem específica (Chrome mostra `Failed to fetch dynamically imported module`, mesma raiz).

## Estado da blindagem atual

Já implementado em turnos anteriores:

- `retryImport` envolve todos os 61 `lazy()` do `App.tsx`.
- Guards globais em `src/main.tsx` interceptam falhas de import dinâmico.
- `SentryFallback` dispara reload resiliente.

O guard atual em `main.tsx` casa strings tipo `Failed to fetch dynamically imported module`. **A variante `'text/html' is not a valid JavaScript MIME type'` (Safari) precisa ser confirmada como reconhecida pelo mesmo guard** — se ela cair no fallback do Sentry, o reload acontece; se não casar em nenhum matcher, o usuário vê o boundary sem auto-reload.

## Próximo passo (apenas verificação, sem implementar)

Antes de decidir qualquer mudança, preciso confirmar em `src/main.tsx` e no `retryImport` se o matcher inclui a substring `text/html` / `valid JavaScript MIME type`. Se já inclui, nada a fazer. Se não inclui, a única mudança justificada é **adicionar essa substring ao matcher existente** (uma linha).

Não haverá nenhuma outra alteração: nada de refactor, nada de novos arquivos, nada de mudança em `SentryFallback`.
