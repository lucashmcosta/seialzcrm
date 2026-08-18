# Hotfix: restaurar “Carregar mais” no Comercial

## Diagnóstico confirmado

- **Módulo afetado:** somente a lista de conversas do Comercial (`/commercial`).
- **Documentação consultada:** `docs/README.md`, `docs/STATUS.md`, documentação de Messages e registros de drift/conflitos encontrados pela busca.
- **ADR aplicável:** nenhum para esta correção estritamente visual.
- **Banco, RLS, Edge Functions, integrações e multi-tenancy:** não serão alterados.
- O botão **“Carregar mais”**, a condição `hasMore`, o limite inicial de 50, o cursor e o append do próximo lote continuam no código.
- A alteração anterior de `h-screen` para `h-full min-h-0` corrigiu o container externo, mas não o filho flex rolável.
- O `ScrollArea` da lista usa `flex-1` sem `min-h-0`; em uma coluna flex, sua altura mínima automática acompanha o conteúdo das 50 conversas e empurra o rodapé com o botão para fora da área visível.

## Alteração mínima

1. Em `src/pages/messages/MessagesList.tsx`, adicionar `min-h-0` ao `ScrollArea` que contém a lista e o botão existente.
2. Não mover, recriar nem reestilizar o botão.
3. Não alterar hook, query, RPC, paginação, filtros, busca, ordenação, realtime, previews, checks ou painel redimensionável.

## Validação

- Confirmar typecheck limpo pelo harness.
- Confirmar no código que a primeira carga permanece em 50.
- Confirmar que o botão existente continua condicionado apenas por `hasMore`.
- Confirmar que `loadMore` mantém cursor, append e a lista anterior.
- Verificar visualmente que o rodapé passa a ser alcançável pelo scroll sem resetar a posição.

## Relatório final

Informar `SHOW_MORE_RESTORED`, `PAGINATION_REGRESSION_FIXED`, commits relacionados e arquivos alterados.