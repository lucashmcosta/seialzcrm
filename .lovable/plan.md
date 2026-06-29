# Renderizar nota de migração como divisor de sistema (estilo Divus)

## Problema

A nota inserida pelo backend `meta-whatsapp-send` (metadata.kind='endpoint_migration_meta_7020') aparece como balão de mensagem comum em `/messages`. Deve virar um divisor centralizado estilo "HOJE / ONTEM".

## Escopo

- Apenas presentational em `/messages` desktop e mobile.
- Sem mudanças em backend, schema, edge functions, dispatcher ou `/inbox`.
- Sem alterar a inserção da nota.

## Regra de detecção (estrita)

Somente este predicado vira divisor:

```ts
const isEndpointMigration =
  m.metadata &&
  typeof m.metadata === 'object' &&
  (m.metadata as any).kind === 'endpoint_migration_meta_7020';
```

NÃO usar `m.direction === 'internal'`, NÃO usar `sender_type === 'system'` sozinho, NÃO usar `'kind' in metadata`. Notas internas comuns ficam como estão.

## Mudanças

### 1. `src/pages/messages/MessagesList.tsx`

a) Adicionar `metadata` ao `select` (linha ~824):
```
id, content, direction, sent_at, whatsapp_status, ..., sender_type, sender_name, sender_agent_id, metadata,
reply_to_message:reply_to_message_id (...)
```

b) Estender o type `Message` (linha ~143):
```ts
metadata?: Record<string, any> | null;
```

c) No `chatItems.map` (linha ~1685), antes do render padrão da mensagem, aplicar o curto-circuito **só** para a migração:

```tsx
if (item._type === 'message') {
  const m = item.data;
  const isEndpointMigration =
    m.metadata &&
    typeof m.metadata === 'object' &&
    (m.metadata as any).kind === 'endpoint_migration_meta_7020';

  if (isEndpointMigration) {
    return (
      <Fragment key={`sys-${m.id}`}>
        {separator}
        <div className="flex justify-center my-3">
          <div className="max-w-[80%] px-3 py-1.5 rounded-full bg-muted/70 text-muted-foreground text-[11px] font-medium tracking-wide text-center shadow-sm">
            {m.content}
          </div>
        </div>
      </Fragment>
    );
  }
}
```

### 2. `src/components/mobile/MobileMessagesList.tsx`

Mesma alteração:
- Adicionar `metadata` ao `select` (linha 340).
- Adicionar `metadata` ao type `Message` (linha ~69).
- Inserir o mesmo curto-circuito (predicado idêntico) antes da renderização padrão do balão.

## Critério de aceite

- Nota de migração ("A partir daqui você está falando com o cliente pelo novo número...") aparece centralizada, pill `bg-muted/70`, igual ao separador "HOJE", sem avatar/autor/timestamp/cauda de balão.
- Notas internas comuns (amarelas) continuam idênticas.
- Mensagens normais (inbound/outbound) inalteradas.
- `/inbox` inalterado.

## Próximo passo

Após aprovação visual, rodar bateria A, B, C, D.
