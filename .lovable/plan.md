# Restaurar o tempo relativo na lista de conversas do Comercial

Somente apresentação/CSS. Nada de query, ordenação, realtime ou regra de negócio.

## Auditoria

1. **O dado ainda existe?** Sim. `ChatThread` em `src/hooks/useMessageThreads.ts` continua expondo `updated_at`, `last_message_at` e `created_at`, todos vindos da RPC `rpc_list_message_threads` (e do caminho de realtime `rpc_get_message_threads_by_ids`). Nada foi removido do hook.
2. **Qual campo alimenta o tempo relativo?** `value.updated_at` (não `last_message_at`), formatado por `formatRelativeTime(value.updated_at, locale)` — "Agora", "43 min atrás", "1 hora atrás", "Ontem 14:20".
3. **O JSX foi removido?** Não. O `<span className="shrink-0 text-[11px] text-muted-foreground leading-5">` com `formatRelativeTime` continua no `ChatListItem` de `src/pages/messages/MessagesList.tsx`, à direita da linha do nome. O diff do commit que trocou o preview por `LastMessagePreviewLine` não tocou nessa linha. Ou seja: o valor está sendo renderizado, mas ficou fora da área visível — é problema de layout, não de dado.
   Causa: em `src/components/messages/LastMessagePreview.tsx` o texto é um `<span className="truncate whitespace-nowrap">` dentro de um container `flex`. Como esse span é filho flex sem `min-w-0`, ele não encolhe abaixo da largura do conteúdo, então a linha de preview estoura a largura do item — exatamente o que aparece no print, com o texto passando da borda direita do painel — e o conteúdo à direita (o horário) é empurrado/cortado.
4. **Realtime continua correto?** Sim. Cada UPDATE em `message_threads` (inclusive o disparado pelo trigger `fn_update_thread_last_message` quando muda status/mensagem) chega ao hook, que reenriquece a thread por id e substitui a linha no state com o `updated_at` novo. O tempo relativo volta a atualizar assim que o item recuperar o espaço.

## Correção mínima

1. `src/components/messages/LastMessagePreview.tsx` — adicionar `min-w-0` ao span de texto (`truncate whitespace-nowrap min-w-0`), permitindo que ele encolha e o truncate funcione de verdade dentro do item.
2. `src/pages/messages/MessagesList.tsx` — reforçar o recorte no `ChatListItem`: `overflow-hidden` no item e `min-w-0` já presente na coluna, garantindo que nenhuma linha filha empurre o horário para fora. O `<span>` do tempo relativo permanece onde está, com `text-[11px] text-muted-foreground`, `shrink-0` e sem quebra de linha; o preview segue logo abaixo.

Nenhuma mudança em `updated_at`, ordenação, RPC, hooks de dados ou backend.

## Validação

Typecheck e conferência visual na lista: item com preview longo (texto truncado com "…" e horário visível na mesma linha do nome), item de mídia curta ("Áudio"), item sem preview, e atualização do horário ao chegar mensagem nova.
