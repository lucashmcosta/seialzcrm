# Trazer de volta o botão de filtro por número no Comercial

## O que aconteceu

Na correção anterior, o filtro passou a listar somente números comerciais — e o botão só aparece quando existem **dois ou mais** números comerciais. Hoje a Central Trabalhista tem apenas um número comercial ativo (o 7067), então o botão desapareceu.

## O que fazer

Voltar a mostrar o botão do funil sempre que houver ao menos um número comercial, mantendo a correção de conteúdo (o número de Atendimento 7027 continua fora da lista).

Resultado: o botão volta a aparecer; ao abrir, mostra "Todos os números" e o 7067.

## Detalhe técnico

`src/pages/messages/MessagesList.tsx`:
- Trocar `hasMultipleSalesEndpoints = salesEndpoints.length >= 2` por uma condição de presença (`salesEndpoints.length >= 1`) usada na renderização do botão (~linha 1945).
- Manter `endpoints={salesEndpoints}` no `EndpointFilterDialog` e o reset de `endpointFilter` para `all` quando o número selecionado sai da lista.

Nada de mudança em RLS, envio de mensagens, RPCs ou no módulo Atendimento.
