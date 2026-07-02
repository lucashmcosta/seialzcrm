## Objetivo

Cor do badge `Novo · NNNN` deixa de ser fixa por tela e passa a ser derivada do **propósito do endpoint** (coluna `purpose` de `communication_endpoints`). Regra aplicada tanto em `/inbox` quanto em `/messages`, sempre exibindo o badge quando houver endpoint.

## Mapa fixo por propósito

| purpose            | Cor         | Uso típico            |
| ------------------ | ----------- | --------------------- |
| `customer_service` | Amarelo     | 7027 (Atendimento)    |
| `sales` / `commercial` | Azul    | 7020 (Comercial)      |
| `marketing`        | Rosa        |                       |
| `other` / null / desconhecido | Roxo | 7067 e futuros      |

Cores usam tokens Tailwind já presentes no projeto (`amber`, `blue`, `rose`, `violet`) via classes `border-*/30 bg-*/10 text-*` — sem hardcode hex.

## Mudanças

### 1. `src/components/messages/EndpointBadge.tsx`
- Adicionar prop `purpose?: string | null`.
- Adicionar tone `rose` e `violet` ao `TONE_CLASSES`.
- Nova função interna `toneFromPurpose(purpose)` retornando `'amber' | 'blue' | 'rose' | 'violet'`.
- Comportamento:
  - Se `purpose` for passado, ele **prevalece** sobre `tone` (deriva a cor pelo mapa).
  - Se não vier `purpose`, mantém o `tone` explícito (retrocompatível).
- Manter `officialNumbers` opcional; nas telas visadas não será mais passado.

### 2. `src/components/inbox/InboxThreadList.tsx`
- Passar `purpose={t.primary_endpoint?.purpose ?? null}` ao `EndpointBadge`, remover `tone="amber"` fixo e `officialNumbers`.

### 3. `src/components/inbox/InboxThreadDetail.tsx`
- Passar `purpose={thread.primary_endpoint?.purpose ?? null}` nos dois `EndpointBadge` do header.

### 4. `src/pages/messages/MessagesList.tsx` (e demais call sites em `/messages`)
- Passar `purpose` do endpoint no lugar de `tone="blue"` fixo. Remover a supressão via `officialNumbers` (o badge passa a aparecer em toda thread com endpoint conhecido).
- Se algum call site não tiver `purpose` no cache, fazer fallback para `tone="blue"` para não regressar visualmente.

### 5. Sem mudanças
- Backend, RPCs, schema.
- Hook `useOrgWhatsAppEndpoints` continua existindo (pode ser usado em outros lugares); apenas deixamos de usar o `officialNumbers` nestes call sites.

## Validação

- `/inbox` lista:
  - 7027 → badge **amarelo**.
  - 7020 (infiltrado) → badge **azul**.
  - 7067 → badge **roxo**.
- `/inbox` header da conversa: mesma cor da lista.
- `/messages`:
  - Threads do 7020 → **azul**.
  - Threads do 7027 (se aparecerem por regra antiga) → **amarelo**.
  - Outros → **roxo/rosa** conforme purpose.
- Legibilidade em dark mode: variantes `dark:text-*-400` já cobertas para os 4 tones.

## Fora de escopo
- Investigar/rebalancear as 2 exceções detectadas no Atendimento (thread sem endpoint e thread do 7067).
- Painel de configuração de cores por número (não é pedido).
