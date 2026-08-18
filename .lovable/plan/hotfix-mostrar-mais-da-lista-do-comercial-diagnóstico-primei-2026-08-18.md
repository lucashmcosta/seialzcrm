# Hotfix "Mostrar mais" da lista do Comercial — diagnóstico primeiro

## O que a auditoria mostrou (verificado agora, somente leitura)

A lógica de paginação incremental **não foi removida** em nenhum commit recente. Ela está presente e íntegra:

- `src/hooks/useMessageThreads.ts`
  - primeira carga com `p_limit: 50`;
  - `hasMore = rows.length >= limit`;
  - `loadMore` cursor-based (`p_cursor_updated_at` / `p_cursor_id`) fazendo **append** (`setThreads(prev => [...prev, ...mapped])`), nunca replace.
- `src/pages/messages/MessagesList.tsx` (linhas 2078-2092): o bloco `{hasMore && (<Button onClick={loadMore} …>Carregar mais</Button>)}` continua no final da `ScrollArea`, depois do `ListBox`.
- `git log -S"hasMore"` sobre o arquivo aponta apenas o commit que **introduziu** o bloco; nenhum commit posterior o removeu.

Ou seja: não existe rollback pontual a fazer — não há código removido para restaurar. O sintoma relatado (botão não aparece ao chegar no fim da lista) é, portanto, de **renderização/visibilidade** ou de `hasMore` chegando `false`, não de código ausente.

Também observado no print: o contador mostra 50 conversas e há uma faixa em branco abaixo do último item — compatível com o container do botão ocupando espaço sem texto visível.

## Plano proposto (mínimo, sem mudar UX/paginação/backend)

1. Prova de renderização no preview autenticado, sem alterar layout: inspecionar o final da `ScrollArea` do `/commercial` e registrar se o nó do botão existe no DOM, seu texto, tamanho e estilo computado, e o valor de `hasMore`.
2. Conforme o resultado, aplicar a menor correção possível:
   - se o nó existe mas está invisível/clipado: ajuste pontual de visibilidade no bloco já existente (sem mexer em `ListBox`, coluna redimensionável, preview, checks, realtime, filtros, busca ou ordenação);
   - se `hasMore` está `false`: corrigir apenas a condição que o zera, mantendo `p_limit` 50 e o cursor atuais.
3. Validar: primeira carga com o mesmo limite, botão presente no fim, clique traz somente o próximo lote em append, sem duplicação, sem reset de scroll, filtros e busca preservados, typecheck limpo.

## Não será alterado

Preview da última mensagem, checks do WhatsApp, ícones, coluna redimensionável, realtime, filtros, busca, ordenação, backend, RPCs e queries.

## Relatório final (pré-implementação, a fechar após o passo 1)

```text
SHOW_MORE_RESTORED=N/A (nunca foi removido do código)
PAGINATION_REGRESSION_FIXED=PENDENTE (aguardando prova de DOM/hasMore)
COMMITS_TOUCHING_SHOW_MORE=488b7292 (introduziu o bloco; nenhum commit posterior o removeu)
FILES_CHANGED=(nenhum ainda)
```
