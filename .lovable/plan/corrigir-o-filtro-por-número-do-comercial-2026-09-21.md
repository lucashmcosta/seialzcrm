# Corrigir o filtro por número do Comercial

## Problema

No Comercial, a janela "Filtrar por número" lista o número **+55 11 5028-7027**, que é do Atendimento (e ainda com o selo "Principal"). Filtrar por ele nunca traz conversa nenhuma, já que o Comercial não mostra mais conversas do Atendimento.

A lista vem de todos os números de WhatsApp ativos da conta, sem separar o propósito de cada um.

## O que muda

- A janela passa a listar **somente os números do Comercial** — números de Atendimento ficam fora.
- O botão do filtro (funil) só aparece quando a conta tem **dois ou mais números comerciais**. Na Central Trabalhista, hoje só existe um número comercial ativo, então o botão deixa de aparecer — o que é o comportamento correto, já que não há o que filtrar.
- Se um filtro estiver ativo em um número que saiu da lista, ele volta automaticamente para "Todos os números".
- O Atendimento e o envio de mensagens continuam exatamente como estão.

## Detalhes técnicos

Arquivo: `src/pages/messages/MessagesList.tsx`

1. Derivar `salesEndpoints = orgEndpoints.filter(ep => ep.purpose !== 'customer_service')` (memoizado).
2. Passar `salesEndpoints` para `EndpointFilterDialog` (prop `endpoints`).
3. Nova flag `hasMultipleSalesEndpoints = salesEndpoints.length >= 2` usada apenas na condição de render do botão de funil (linha ~1935). `hasMultipleEndpoints` do hook `useOrgWhatsAppEndpoints` permanece intacto para `useThreadEndpointMap` / `useThreadBadgeEndpoints` / badges de rota.
4. `useEffect` que reseta `endpointFilter` para `'all'` quando o id selecionado não está em `salesEndpoints`.

Nada de mudança em banco, RPC, RLS ou edge functions; `EndpointFilterDialog.tsx` e o hook não são alterados.
