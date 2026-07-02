## Objetivo

Na tela **Atendimento** (`/inbox`), exibir o badge amarelo `Novo · NNNN` (últimos 4 dígitos do endpoint) em **todas** as conversas, não só nas exceções. Assim o usuário tem confirmação visual imediata do número que está atendendo (ex.: `7027` para a esmagadora maioria, e `7067` destacando o caso isolado que trataremos depois).

Comportamento da tela **Mensagens** (`/messages`) permanece inalterado (badge azul só aparece quando o número não é o "oficial padrão" — regra atual).

## Mudanças

### 1. `src/pages/inbox/InboxPage.tsx`
- Remover a passagem de `officialNumbers` para `InboxThreadList` (ou passar uma lista vazia), de forma que o badge amarelo nunca seja suprimido no Atendimento.
- Manter o hook `useOrgWhatsAppEndpoints` apenas se ainda for necessário para outras exibições; caso contrário, remover para não carregar dados à toa.

### 2. `src/components/inbox/InboxThreadList.tsx`
- Ajustar a lógica de renderização do `EndpointBadge` para sempre renderizar quando houver `endpoint_phone_number` na thread, ignorando a checagem "é número oficial".
- Manter `tone="amber"` e o formato `Novo · <últimos 4>`.
- Fallback: se a thread não tiver endpoint carregado, não renderiza nada (sem placeholder).

### 3. `src/components/inbox/InboxThreadDetail.tsx` (header da conversa)
- Garantir que o badge amarelo também apareça no header, seguindo a mesma regra "sempre que houver endpoint". Hoje o header já mostra a identidade textual (`+55 11 5028-7027 · Meta Cloud...`), então esse badge é o reforço visual curto ao lado do nome.

### 4. Sem mudanças em
- `EndpointBadge.tsx` (a variante `tone` já existe).
- Tela `/messages` e `MessagesList.tsx` (regra "só quando não é oficial" preservada — badge azul).
- Backend / RPCs / dados.

## Fora de escopo (tratamos depois, conforme você pediu)
- Investigar/normalizar o caso isolado do endpoint **7067** aparecendo no Atendimento.
- Investigar a thread sem endpoint associado.

## Validação
- Abrir `/inbox`: cada item da lista deve mostrar `Novo · 7027` (amarelo) na maioria; o item do Rafael/Wagner deve mostrar `Novo · 7067`.
- Abrir uma conversa: header exibe o badge amarelo ao lado do nome, além do bloco "Nosso número" no painel direito.
- Abrir `/messages`: badge azul continua aparecendo apenas para números não-oficiais (comportamento atual, sem regressão).
