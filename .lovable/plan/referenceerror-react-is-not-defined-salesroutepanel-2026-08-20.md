# ReferenceError: React is not defined — SalesRoutePanel

## Diagnóstico (verificado)

- O evento do Sentry é de `2026-08-13T06:49:53–06:50:01`.
- O arquivo `src/components/messages/route/SalesRoutePanel.tsx` usa `React.forwardRef` (linha 25), e o JSX do `Row` fica na linha 31 — exatamente o frame reportado.
- O `import React from 'react'` foi adicionado nesse arquivo em `2026-08-13 06:50:03`, ou seja, ~2 segundos **depois** do último evento capturado.

Conclusão: esse erro específico já está corrigido no código atual. Não há regressão pendente nesse arquivo.

## Verificação de risco residual (verificada)

- Varredura em `src/`: nenhum outro arquivo usa `React.<valor>` em runtime (`forwardRef`, `memo`, hooks, `lazy`, `createElement`, `Fragment`…) sem importar `React`. As únicas ocorrências sem import são comentários (`src/App.tsx`) ou uso apenas de tipo (`React.ReactNode`).
- `tsgo --noEmit -p tsconfig.app.json` passa sem erros.

## Proposta mínima (opcional, 2 arquivos)

Padronizar as duas referências de tipo que hoje dependem do namespace global:

1. `src/components/messages/route/SalesConversationHeader.tsx` — trocar `React.ReactNode` por `ReactNode` com `import type { ReactNode } from 'react'`.
2. `src/components/messages/route/SalesConversationMeta.tsx` — mesma troca.

Nenhuma mudança de comportamento, nenhum efeito em runtime. Só remove a dependência do namespace `React` implícito nesses arquivos.

## Alternativa

Se preferir, não mexemos em nada: basta resolver/ignorar a issue no Sentry, já que ela pertence a um release anterior à correção.
