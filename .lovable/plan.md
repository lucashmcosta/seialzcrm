# Corrigir modal "Detalhes da rota" cortado

## Problema

O modal não tem limite de altura nem rolagem. Com o conteúdo atual (painel da Rota + histórico de endpoints + ~10 linhas de dados técnicos) ele fica mais alto que a janela, e o topo/base aparecem cortados — como na captura.

## Correção (UI only)

Arquivo: `src/components/messages/route/SalesRouteDetailsDialog.tsx`

- `DialogContent`: limitar a altura a `max-h-[85dvh]` e transformar em coluna flex, mantendo `max-w-lg`.
- Cabeçalho (título + descrição) fixo no topo, sem encolher.
- Corpo (painel da Rota + linhas de dados) em um contêiner com `flex-1 overflow-y-auto` e `scrollbar-hide`, com padding-right pequeno para o conteúdo não colar na borda.
- Nenhuma mudança de dados, hooks, queries, backend ou textos.

## Não será alterado

Conteúdo do modal, `SalesRoutePanel`, cabeçalho da conversa, Atendimento, Mobile, backend, flags.
