
# Plano: Atualizar URL do Backend Railway

## Objetivo

Alterar a URL do serviço WhatsApp para usar diretamente a URL do backend Railway, removendo a dependência de variável de ambiente.

## Arquivo a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/services/whatsapp.ts` | Alterar linha 1 para usar URL hardcoded |

## Mudança

**Antes (linha 1):**
```typescript
const API_BASE = `${import.meta.env.VITE_RAILWAY_WHATSAPP_URL}/api/whatsapp`;
```

**Depois (linha 1):**
```typescript
const API_BASE = 'https://seialz-backend-production.up.railway.app/api/whatsapp';
```

## Resultado Esperado

As chamadas à API do WhatsApp irão apontar corretamente para:
- `https://seialz-backend-production.up.railway.app/api/whatsapp/templates`
- `https://seialz-backend-production.up.railway.app/api/whatsapp/templates/:id`
- `https://seialz-backend-production.up.railway.app/api/whatsapp/send`
- etc.

Isso resolve o problema da URL incorreta que estava sendo gerada (`undefined/api/whatsapp/templates`).
