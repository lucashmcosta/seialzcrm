## Objetivo

Adicionar botão "Nova Conversa" na tela `/inbox` (Atendimento) que abre o mesmo diálogo de busca de contato já usado em `/messages`, mas forçando o endpoint do **Atendimento** em vez do endpoint preferido genérico.

## Validação no banco (feita)

Endpoints da org `Central Trabalhista` (`40ae935c-…`):

| number | purpose |
|---|---|
| +551150287020 (Comercial) | `commercial` |
| +551150287027 (Atendimento) | **`other`** |

Ou seja: o endpoint de Atendimento **não** usa `purpose = 'customer_service'`. O conjunto correto para "Atendimento" é `purpose IN ('customer_service', 'other')` — exatamente o mesmo conjunto que `inboxScope.ts` já considera (`NOT IN ('commercial','vendor_personal')`).

## Mudanças

### 1. `src/components/messages/NewConversationDialog.tsx`
- Adicionar prop opcional `forcePurposes?: Array<'customer_service' | 'other' | 'commercial' | 'vendor_personal'>` (default: comportamento atual).
- Quando `forcePurposes` definido:
  - `preferredEndpointId` = endpoint ativo da org cujo `purpose ∈ forcePurposes`, escolhendo o mais recente (mantendo a regra atual de transicional > oficial **dentro** do subconjunto filtrado).
  - Esconder o `EndpointSelector` (lock no endpoint forçado) para não permitir trocar para outro purpose.
  - Se não houver endpoint nesse conjunto, mostrar estado vazio: "Nenhum número de Atendimento configurado".
- Aceitar prop opcional `title?: string` (ex.: "Nova Conversa de Atendimento").

### 2. `src/pages/inbox/InboxPage.tsx`
- Importar `NewConversationDialog` e adicionar estado `newConvOpen`.
- Botão "Nova Conversa" no header (próximo ao toggle "Apenas minhas") — `forcePurposes={['customer_service','other']}`.
- Ao selecionar contato/criar thread: setar `selectedId` com o `threadId` retornado e disparar `refreshThreads()` + `refreshCounts()`.

### 3. Mobile (`MobileInbox`)
- Mesmo botão "Nova Conversa" no header da lista, reusando `NewConversationDialog` com `forcePurposes={['customer_service','other']}`.

## Critérios de aceite

- Botão "Nova Conversa" visível em `/inbox` (desktop e mobile).
- Busca por nome/telefone idêntica à de `/messages`.
- Thread criada/aberta sempre fica vinculada a um endpoint com `purpose IN ('customer_service','other')` — nunca cai no Comercial (7020).
- Se contato já tem thread no Atendimento, abre a existente; senão cria nova com `primary_endpoint_id = <endpoint de atendimento>`.
- `/messages` continua usando o comportamento atual (endpoint preferido genérico, com seletor).
- Sem mudanças em RPC, RLS, migrations, ou regras de purpose/lifecycle.

## Observação

`inboxScope.ts` já inclui threads cujo `primary_endpoint.purpose` é `customer_service`, `other`, ou NULL, então toda thread criada via este botão aparecerá automaticamente em `/inbox`.
