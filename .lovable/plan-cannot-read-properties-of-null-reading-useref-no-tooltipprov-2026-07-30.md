# `Cannot read properties of null (reading 'useRef')` no TooltipProvider

## Estado verificado agora

- O evento colado tem timestamp `2026-07-29T21:15:45` — é o **mesmo evento** já analisado no ciclo anterior, não uma nova ocorrência.
- As duas mitigações combinadas naquele ciclo estão no repositório:
  - `vite.config.ts` → bloco `optimizeDeps.include` com react, react-dom, react-router-dom e demais libs React (pré-bundle no boot, reduz reotimização no meio da sessão).
  - `src/instrument.ts` → `beforeSend` descarta eventos cujos frames apontam para `/node_modules/.vite/deps/` (caminho que só existe em dev/preview).
- A origem é ambiental: reotimização de dependências do Vite com a aba aberta faz a página misturar chunks de duas gerações (`?v=` diferentes por lib, visível no próprio stack), e o Radix pega uma segunda cópia do React → dispatcher nulo.

## Conclusão

Nenhuma mudança de código é necessária para este evento. Produção não é afetada (chunks imutáveis e versionados juntos). Se o Sentry reabriu a issue, confirme se o último evento é posterior ao deploy que trouxe o filtro; se for anterior, basta resolver a issue.

## Opções, caso queira endurecer mais

1. **Nada** (recomendado) — aceitar como ruído de dev; F5 na preview resolve quando aparecer.
2. **Auto-reload em dev**: em `src/main.tsx`, ao detectar erro cujo stack contenha `/node_modules/.vite/deps/` e mensagem de hook inválido, disparar `window.location.reload()` uma única vez por sessão (guard em `sessionStorage`), somente quando `import.meta.env.DEV`. Elimina a tela quebrada sem tocar em produção.
3. **Regra de inbound filter no Sentry** (config no painel, sem código) para descartar eventos com `/node_modules/.vite/deps/` antes de contarem cota.

Diga se quer a opção 2 implementada; caso contrário, encerro sem alterações.
