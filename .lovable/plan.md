## "Nova Conversa" sempre sai pelo endpoint novo (genérico por tenant)

Regra **por organização**, sem hardcode de número ou tenant:

- Oficial/legado = todo `external_address` que aparece em `organization_integrations.config_values.whatsapp_number` da org (já é exposto pelo hook como `officialNumbers`).
- Novo/transicional = endpoint WhatsApp ativo da org cujo `external_address` (dígitos) **não** está em `officialNumbers`.
- "Nova Conversa" passa a usar o **endpoint preferido**: se houver pelo menos um endpoint novo/transicional → usa o mais recente (`created_at` desc); se não houver → usa o endpoint oficial (mais recente).
- Tenants com apenas 1 endpoint mantêm o comportamento atual (apenas esse endpoint é escolhido).

### Arquivo afetado
`src/components/messages/NewConversationDialog.tsx` (só ele).

### Mudanças

1. Importar `useOrgWhatsAppEndpoints` e obter `{ endpoints, officialNumbers }` para `organization.id`.
2. Calcular `preferredEndpointId` via `useMemo`:
   - normaliza `external_address` → dígitos.
   - filtra endpoints cujos dígitos **não** estão em `officialNumbers` = "novos".
   - se `novos.length > 0` → pega o `created_at` mais recente dos novos.
   - senão → pega o `created_at` mais recente entre todos os endpoints.
   - se `endpoints.length === 0` → `null` (fallback igual ao atual: cria sem `primary_endpoint_id`).
3. Em `handleSelect`:
   - Query de thread existente passa a filtrar **também** por `primary_endpoint_id = preferredEndpointId` (quando ele existir). Mantém `order updated_at desc`, `limit(1)`, `.maybeSingle()`.
   - Se não encontrar, `insert` da nova thread inclui `primary_endpoint_id: preferredEndpointId` quando ele existir.
4. Desabilita o clique enquanto `endpoints` está carregando para não criar thread sem endpoint quando a org tem múltiplos.

### Comportamento resultante (qualquer tenant)

- Central Trabalhista: oficial 7027 + novo 7067 → "Nova Conversa" sempre abre/cria no 7067, com badge `Novo · 7067`. Thread antiga no 7027 permanece separada.
- Viagi hoje (só oficial) → continua usando o oficial, sem badge, sem efeito colateral.
- Viagi quando ganhar novo número → automaticamente "Nova Conversa" passa a sair pelo novo, sem mudança de código.
- Threads antigas não são tocadas.

### Fora de escopo
Webhook, edge functions, migrations, `ContactMessages`, `WhatsAppChat`, badge styling.
