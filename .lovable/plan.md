# Correção do aviso "Sem inbound para determinar o número de resposta" (UI only)

Sem backend, sem resolver, sem SQL, sem flag. Apenas a derivação de estado na UI.

## Diagnóstico (confirmado)

1. `feature_flags.conv_route_resolver_v2` está habilitada **apenas** para a Viagi (`b246ef6f…`). Para qualquer outra organização o resolver do cliente retorna `applicable: false` com `reason = 'flag_off'`.
2. Em `useSalesRouteView` (`SalesRoutePanel.tsx`) e em `MessagesList.tsx` o estado é derivado como `route.resolved ? … : 'no_route'`. Ou seja, `flag_off`, `not_sales_context`, `missing_input` e o próprio estado de carregamento caem todos em `no_route` — e `no_route` é o que dispara o título "Conversa legada" e o subtexto "Sem inbound para determinar o número de resposta".
   Resultado: o aviso aparece em massa mesmo em threads com inbound recente e outbound funcionando.
3. `useSalesRoute` devolve `EMPTY` (`reason: 'missing_input'`) enquanto a query está em voo, então o aviso também pisca antes de qualquer resposta.
4. Na lista (`ChatListItem`), o `RouteBadge` recebe `endpointAddress` derivado de `useThreadEndpointMap`, que lê `message_threads.primary_endpoint_id` **e só é habilitado quando a org tem 2+ endpoints ativos**. Quando desabilitado ou quando o campo legado é NULL, o badge cai em `state='no_route'` para todas as threads. Essa é uma fonte legada e não deve alimentar o estado.

## Correção

### 1. Estado único derivado do resolver (`SalesRoutePanel.tsx` / `useSalesRouteView`)

Substituir o booleano binário por um estado explícito de 4 valores:

- `online` — `route.resolved` e endpoint ativo
- `offline` — `route.resolved` e endpoint inativo
- `unresolved` — **somente** quando `route.reason === 'REPLY_ROUTE_UNRESOLVED'`
- `unknown` — carregando, `flag_off`, `not_sales_context`, `missing_input`

Apenas `unresolved` habilita a linguagem "Conversa legada / sem inbound roteável". `unknown` é neutro: nenhum aviso, nenhum chip âmbar.

### 2. Cabeçalho e meta (`SalesConversationHeader`, `SalesConversationMeta`)

- Passar o novo estado; remover a condição `|| !address` que hoje força o aviso sempre que o endereço ainda não foi carregado.
- Em `unknown`: exibir apenas o rótulo público já existente ("Modo legado" quando a flag está off), sem subtexto de "sem inbound".
- Em `unresolved`: comportamento atual mantido.

### 3. Composer (`MessagesList.tsx` + `SalesComposerStatus`)

- `noRoute` passa a ser `state === 'unresolved'` (nunca `flag_off`/loading).
- `noRecentInbound` (janela de conversa) permanece independente e inalterado.

### 4. Badge da lista (`ChatListItem` em `MessagesList.tsx`)

- Deixar de mapear "endereço ausente" para `no_route`. Sem dado de endpoint (mapa legado desabilitado ou `primary_endpoint_id` NULL) o badge fica em `unknown` e simplesmente **não renderiza** o indicador âmbar de conversa legada.
- `useThreadEndpointMap` continua existindo apenas como rótulo informativo do número em orgs multi-número; ele deixa de decidir estado de rota.

### 5. Painel/modal técnico

`SalesRoutePanel` e `SalesRouteDetailsDialog` continuam mostrando o motivo técnico exato (`flag_off`, `REPLY_ROUTE_UNRESOLVED`, etc.) — é o único lugar onde jargão é permitido. Em `unknown` o chip mostra "—"/"Modo legado" em vez de "Sem rota".

## Verificação

- `tsgo` + suíte existente (inclui a barreira estática anti-`primary_endpoint_id` do resolver, que continua intacta).
- Conferir que nenhuma decisão de estado da UI passa a ler `primary_endpoint_id`.
- Validação visual autenticada: thread Viagi resolvida (sem aviso), thread Viagi realmente `REPLY_ROUTE_UNRESOLVED` (com aviso), thread de org com flag OFF (sem aviso, "Modo legado"), e `/inbox` sem regressão.

## Arquivos afetados

- `src/components/messages/route/SalesRoutePanel.tsx`
- `src/components/messages/route/SalesConversationHeader.tsx`
- `src/components/messages/route/SalesConversationMeta.tsx`
- `src/components/messages/route/SalesComposerStatus.tsx`
- `src/components/messages/route/RouteIndicators.tsx`
- `src/components/messages/route/SalesRouteDetailsDialog.tsx`
- `src/pages/messages/MessagesList.tsx`

Zero alterações em backend, resolver, trigger, Routes, Atendimento ou feature flags.
