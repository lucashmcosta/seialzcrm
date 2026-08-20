# "Rendered more hooks than during the previous render" — PowerDialer

## Diagnóstico (verificado)

- O stack aponta para `src/hooks/usePowerDialer.ts` e `src/components/outbound/PowerDialerGlobalConsole.tsx`. **Nenhum desses arquivos existe no projeto** e não há histórico deles no repositório (`git log` vazio, busca por `PowerDialer` em `src/` sem resultados).
- O erro foi disparado durante **Hot Module Replacement**: as últimas frames são `Object.scheduleRefresh` → `/@react-refresh:228` → `performReactRefresh`. Isso só acontece no dev server / preview, nunca em produção.
- Todas as frames de React estão em `/node_modules/.vite/deps/chunk-*.js`, caminho que também só existe em dev.
- `eslint` com `react-hooks/rules-of-hooks` roda limpo em todo o `src/` — nenhuma violação de ordem de hooks no código atual.

Conclusão: é ruído de HMR de um código que não está mais no projeto. Não há bug a corrigir.

## Por que o filtro do Sentry não pegou

`src/instrument.ts` já descarta eventos cujas frames apontam para `/node_modules/.vite/deps/` — esse filtro foi adicionado em `2026-07-29`. O evento em questão é anterior a isso (ou de um release sem o filtro), então já está coberto hoje.

## Ação proposta

1. Resolver/ignorar a issue no Sentry — pertence a código removido e a um caminho dev-only já filtrado.
2. (Opcional, 1 arquivo) Reforçar o filtro em `src/instrument.ts`: descartar também eventos cuja stack contenha frames de `/@react-refresh` ou `/@vite/client`, cobrindo erros de HMR que cheguem sem frames de `.vite/deps`. Mudança isolada no `beforeSend`, sem efeito em runtime da aplicação.

Nenhuma alteração em banco, edge functions, RLS ou lógica de negócio.
