## Objetivo

Permitir escolher de qual número WhatsApp a Nova Conversa será aberta, evitando que a heurística atual selecione o endpoint errado (caso atual: 7491 em vez de 7020 na Central Trabalhista).

## Mudanças

### 1. `src/components/messages/NewConversationDialog.tsx`
- Reaproveitar o componente existente `EndpointSelector` (já usado no composer).
- Adicionar `useState<string | null>` para o endpoint selecionado, inicializado com `preferredEndpointId` (heurística atual permanece como default).
- Renderizar o seletor logo abaixo do input de busca, **somente quando** `endpoints.length >= 2` (mesma regra do `EndpointSelector`).
- Em `handleSelect`, usar `selectedEndpointId` (em vez de `preferredEndpointId`) tanto no filtro de thread existente quanto no `insertPayload.primary_endpoint_id`.
- Resetar `selectedEndpointId` para o `preferredEndpointId` quando o diálogo abre/fecha.

### 2. Label do seletor
Manter o padrão atual do `EndpointSelector` (`Enviar de` / `Send from`) — já cobre i18n pt-BR/en-US.

### 3. Sem mudança na heurística `preferredEndpointId`
Ela continua válida como default; o seletor só dá ao usuário a chance de sobrescrever. Orgs com 1 endpoint não veem diferença.

## Fora de escopo
- Nenhuma migração de dados.
- Nenhuma mudança em endpoints/threads existentes.
- Nenhuma mudança no composer ou no envio.

## Validação
- Org com 1 endpoint: dialog renderiza igual a hoje.
- Org Central Trabalhista (vários endpoints Meta Cloud): seletor aparece, mostrando 7491 e 7020; usuário escolhe 7020 e a thread é criada/encontrada com `primary_endpoint_id` = 7020.
- Conversa já existente naquele endpoint é reaproveitada (mesma lógica de filtro por `primary_endpoint_id`).
