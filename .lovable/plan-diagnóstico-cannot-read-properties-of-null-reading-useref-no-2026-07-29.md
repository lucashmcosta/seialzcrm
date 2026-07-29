# Diagnóstico: `Cannot read properties of null (reading 'useRef')` no TooltipProvider

## O que foi verificado agora

- Existe apenas **uma** cópia de React instalada (`node_modules/react`), então não é conflito de versões duplicadas no repositório.
- No stack trace do erro, cada dependência pré-otimizada veio com um hash diferente:
  `@radix-ui_react-tooltip.js?v=b45f3917`, `@tanstack_react-query.js?v=b012d0b3`, `react-helmet-async.js?v=2995e0c3`.
  Hashes divergentes na mesma página = a aba estava misturando chunks de duas gerações do cache do Vite (`node_modules/.vite/deps`), então o Radix carregou um módulo React diferente do que renderizava a árvore → dispatcher nulo → `useRef` em `null`.
- O cache `_metadata.json` foi regravado às 22:05 (reoptimização/restart do dev server), depois do evento das 21:15.
- Carreguei `/pt-br` no navegador agora: a página renderiza normalmente, **sem** o erro de `useRef` e sem tela branca.
- Os avisos "Function components cannot be given refs ... at App" não vêm do código do projeto (`src/App.tsx` não passa `ref` em nenhum ponto) — são ruído da instrumentação de preview em desenvolvimento.

## Conclusão

Erro exclusivo do ambiente de desenvolvimento/preview, causado por re-otimização de dependências do Vite enquanto a aba estava aberta. Não afeta o build de produção (lá os chunks são imutáveis e versionados juntos). Já está resolvido nesta sessão pelo restart do dev server.

## O que dá para fazer (opcional)

1. **Nada** — aceitar como ruído de dev; quando acontecer, um F5 na preview resolve.
2. **Reduzir a frequência**: declarar em `vite.config.ts` um `optimizeDeps.include` com as libs React-dependentes principais (radix, tanstack query, helmet, framer-motion, react-aria) para que o pré-bundle seja feito de uma vez no boot, em vez de disparar reotimizações no meio da sessão.
3. **Filtrar no Sentry**: se esse erro estiver criando issues, ignorar eventos cujo `filename` contenha `/node_modules/.vite/deps/` (caminho que só existe em dev), em `src/instrument.ts`.

Nenhuma dessas mudanças foi aplicada — diga qual (se alguma) deseja que eu implemente.
