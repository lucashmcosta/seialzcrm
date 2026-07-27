## Diagnóstico objetivo

O erro é a mesma família de **stale chunk pós-deploy**, mas com um detalhe novo confirmado em produção: a URL antiga `https://crm.seialz.com/assets/ContactForm-D98BmYZC.js` hoje responde **200 com `content-type: text/html`**, não 404. Isso acontece porque o rewrite global do Vercel (`/(.*)` → `/index.html`) também captura caminhos inexistentes em `/assets/*`, então o navegador tenta carregar HTML como JavaScript e o React cai no ErrorBoundary.

O código atual já tem recuperação funcional ampla (`retryImport`, guards globais em `main.tsx`, fallback do Sentry e filtros no `instrument.ts`). A lacuna é de **hosting/configuração**: assets antigos inexistentes deveriam retornar 404/410, não `index.html`. Enquanto `/assets/*` cair no fallback SPA, alguns navegadores/sessões antigas ainda podem gerar esse evento antes do reload silencioso ou continuar poluindo o Sentry.

## Plano de correção

1. **Ajustar `vercel.json` para não fazer SPA fallback em assets**
   - Trocar o rewrite global atual por regras que preservem arquivos estáticos.
   - Garantir que `/assets/<chunk-antigo>.js` inexistente não seja reescrito para `/index.html`.
   - Manter deep links SPA funcionando para rotas como `/contacts/:id/edit`.

2. **Manter a recuperação client-side existente**
   - Não remover `retryImport`, guards globais ou fallback do Sentry.
   - Eles continuam necessários quando o navegador recebe 404/410 de um chunk antigo.

3. **Alinhar a detecção de erro, se necessário**
   - Confirmar que tanto `Failed to fetch dynamically imported module` quanto `text/html is not a valid JavaScript MIME type` continuam tratados como stale chunk.
   - Se houver diferença entre `App.tsx` e `instrument.ts`, alinhar os padrões sem ampliar demais o filtro.

4. **Validar em produção/local por simulação**
   - Após a alteração, verificar que uma URL fake em `/assets/*.js` não retorna HTML com `content-type: text/html`.
   - Verificar que uma rota SPA real continua caindo em `index.html`.

## Escopo afetado

- **Módulo afetado:** plataforma/deploy/frontend, não Contacts em si.
- **Docs consultados:** `docs/README.md`, `docs/STATUS.md`, `docs/operations/conflicts.md`, `docs/platform/deployment/README.md`, `docs/platform/performance/README.md`.
- **ADR aplicável:** nenhuma ADR específica de deploy/chunk recovery foi encontrada nos arquivos consultados.
- **Não toca:** banco, RLS, Edge Functions, integrações externas ou multi-tenancy.
- **Descoberta adicional:** não é necessária para corrigir; o comportamento foi confirmado por HEAD público em produção.