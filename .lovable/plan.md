# A/B determinístico — preview × “Carregar mais” em `/commercial`

## Objetivo e restrições

Executar somente diagnóstico read-only no navegador, na revisão atual, sem publicar e sem corrigir a paginação. Permanecem congelados: `hasMore`, `loadMore`, cursor, limite 50, RPC, queries, realtime, busca, filtros e ordenação.

O A/B não exigirá editar temporariamente o código: os dois passos usarão a mesma revisão e sessões novas do navegador. No Passo A, uma regra CSS será injetada apenas na página automatizada para ocultar o nó do preview (`display: none`) antes das medições; hooks, query em lote e estado continuarão ativos. No Passo B, a página será recarregada sem essa regra, restaurando exatamente o render atual.

## Estado confirmado antes do teste

- O módulo afetado é apenas **Messages/Comercial** (`/commercial`); Inbox não será tocado.
- `ChatListItem` é um `ListBoxItem` do `react-aria-components` e o preview está entre o cabeçalho do contato e a linha de metadados.
- O rodapé condicionado por `hasMore` é irmão do `ListBox`, dentro do mesmo `ScrollArea`.
- O `ScrollArea` usa viewport Radix com `h-full`; o painel lateral e ancestrais usam uma cadeia de alturas fixas/flex e `overflow-hidden`.
- A busca inicial continua limitada a 50 e `hasMore` continua derivado de `rows.length >= limit`.
- A busca estática inicial não encontrou virtualizer, `estimateSize` ou `itemHeight` nessa lista; isso será confirmado também no DOM/runtime.
- Build atual está verde e não há erro runtime registrado relacionado à lista.

## Execução do A/B

### 1. Preparar uma medição reproduzível

- Abrir `/commercial` em navegador automatizado autenticado, viewport fixa de 1280×1800.
- Manter filtros, busca e organização idênticos entre A e B; registrar os valores ativos.
- Esperar o loading finalizar e a quantidade de threads estabilizar.
- Identificar no DOM: viewport real do Radix ScrollArea, `ListBox`, todos os `ListBoxItem`, preview e rodapé/botão “Carregar mais”.
- Rolar o viewport real até `scrollTop = scrollHeight` e aguardar um frame/layout estável antes de medir.

### 2. Passo A — preview visualmente desligado

- Em uma página nova, injetar somente CSS efêmero que esconda os nós de `LastMessagePreview`; não desmontar hooks nem alterar fonte, props ou dados.
- Confirmar por DOM/computed style que nenhum preview ocupa espaço.
- Rolar até o fim e capturar screenshot e métricas:
  - `A_PREVIEW_RENDERED=NO`
  - `A_THREADS_LOADED`
  - `A_HAS_MORE` inferido pela presença do rodapé condicionado
  - `A_SHOW_MORE_VISIBLE`
  - `A_SCROLL_CLIENT_HEIGHT`
  - `A_SCROLL_SCROLL_HEIGHT`
  - `A_SHOW_MORE_OFFSET_TOP`
  - altura amostral/mediana dos itens (`HEIGHT_WITHOUT_PREVIEW`)

### 3. Passo B — preview exatamente como está

- Abrir outra página/sessão nova na mesma revisão, sem CSS injetado.
- Repetir os mesmos filtros, espera, rolagem, screenshot e medições:
  - `B_PREVIEW_RENDERED=YES`
  - `B_THREADS_LOADED`
  - `B_HAS_MORE`
  - `B_SHOW_MORE_IN_DOM`
  - `B_SHOW_MORE_VISIBLE`
  - `B_SCROLL_CLIENT_HEIGHT`
  - `B_SCROLL_SCROLL_HEIGHT`
  - `B_SHOW_MORE_OFFSET_TOP`
  - altura amostral/mediana dos itens (`HEIGHT_WITH_PREVIEW`)

A visibilidade será calculada por interseção geométrica com o viewport rolável e pelos estilos computados, não apenas por existência no DOM.

## Diagnóstico estrutural condicionado ao resultado

Se `A_SHOW_MORE_VISIBLE=YES` e `B_SHOW_MORE_VISIBLE=NO`, inspecionar sem editar:

- deltas de altura por `ListBoxItem` e altura total real do `ListBox`;
- `scrollHeight`, `clientHeight`, `scrollTop` e retângulos do viewport Radix;
- retângulo/offset do rodapé em relação ao conteúdo e ao viewport;
- `position`, `overflow`, `height`, `min/max-height` e flex sizing de cada ancestral até o painel lateral;
- presença runtime de virtualização, medição fixa, elementos absolutos ou conteúdo fora do fluxo;
- se o rodapé está dentro do nó efetivamente rolável e alcançável no máximo `scrollTop`.

Se A e B não divergirem, não atribuir causa ao preview: repetir uma vez com os mesmos dados e registrar o diagnóstico como `[INCERTO]` caso a regressão não seja reproduzível.

## Entrega e parada

Entregar os campos solicitados, screenshots de A/B e uma causa baseada nas métricas:

```text
A_SHOW_MORE_VISIBLE=
B_SHOW_MORE_VISIBLE=
HEIGHT_WITHOUT_PREVIEW=
HEIGHT_WITH_PREVIEW=
SHOW_MORE_IN_DOM_WITH_PREVIEW=
SCROLL_CLIENT_HEIGHT=
SCROLL_SCROLL_HEIGHT=
SHOW_MORE_OFFSET_TOP=
LIST_USES_FIXED_ITEM_HEIGHT=YES/NO
ROOT_CAUSE=
MINIMAL_SAFE_FIX=
```

Não implementar `MINIMAL_SAFE_FIX`, não publicar e não deixar instrumentação/CSS no projeto. Se o teste permanecer inconclusivo, não farei uma reversão manual por código; indicarei a versão estável exata para restauração pelo History/Revert nativo, preservando a prioridade da paginação.

## Documentação e impacto técnico

- Consultados: `docs/README.md`, `docs/STATUS.md`, `docs/modules/messages/README.md`, ADR-0009, `docs/operations/conflicts.md` e drift ativo relevante.
- ADR aplicável: ADR-0009 apenas para manter a investigação confinada ao Comercial.
- Banco/RLS/Edge Functions/integrações/multi-tenancy: **não afetados**.
- Descoberta adicional: somente se o A/B provar diferença, limitada à árvore DOM/CSS da lista.