

# Correcao: Mapear status "under_review" e similares do Twilio

## Problema

O Twilio retorna status como `received`, `under_review`, `in_review`, `submitted` que nao estao no `statusMap`, fazendo o template cair no fallback `'draft'`.

## Mudancas

Atualizar o `statusMap` em 3 locais (2 arquivos) e adicionar log de warning para status desconhecidos:

### 1. `supabase/functions/twilio-whatsapp-templates/index.ts`

**Linha 100-104** (bloco GET sync):
```typescript
const statusMap: Record<string, string> = {
  'approved': 'approved', 'pending': 'pending', 'rejected': 'rejected',
  'paused': 'rejected', 'disabled': 'rejected', 'unsubmitted': 'draft',
  'received': 'pending', 'under_review': 'pending', 'in_review': 'pending', 'submitted': 'pending',
}
const mappedStatus = statusMap[approvalData.whatsapp.status]
if (!mappedStatus) {
  console.warn(`[SYNC-GET] Unknown approval status: "${approvalData.whatsapp.status}" for ${template.sid} - defaulting to draft`)
}
templateStatus = mappedStatus || 'draft'
```

**Linha 241-245** (bloco POST sync) - mesma mudanca.

### 2. `supabase/functions/twilio-whatsapp-setup/index.ts`

**Linha 467-471** (Step 9) - mesma mudanca.

## Deploy

Ambas edge functions serao redeployadas apos a correcao.

