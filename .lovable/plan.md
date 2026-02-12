
# Corrigir Sincronizacao de Templates WhatsApp - Status e Content Type

## Causa Raiz

Os logs mostram claramente o problema:

```text
ApprovalRequests HTTP status: 405
"The requested resource /v1/Content/HX.../ApprovalRequests/whatsapp does not support the attempted HTTP method GET"
```

A URL esta ERRADA para o GET. Segundo a documentacao oficial do Twilio:

- **GET** (buscar status): `GET /v1/Content/{sid}/ApprovalRequests` (SEM `/whatsapp`)
- **POST** (submeter): `POST /v1/Content/{sid}/ApprovalRequests/whatsapp` (COM `/whatsapp`)

O codigo atual usa `/ApprovalRequests/whatsapp` para ambos, o que faz o GET retornar 405 e todos os templates caem no fallback `'draft'`.

## Mudancas

### 1. twilio-whatsapp-templates/index.ts

**Linha 90 (GET sync)** - Remover `/whatsapp` da URL de GET:
```typescript
// ANTES:
const approvalUrl = `https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests/whatsapp`
// DEPOIS:
const approvalUrl = `https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests`
```

**Linha 237 (POST sync)** - Mesmo fix:
```typescript
const approvalUrl = `https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests`
```

**Linhas 130 e 277 (upsert)** - Mapear `template_type` real a partir de `template.types`:
```typescript
// Extrair content type real
const typeKeys = Object.keys(template.types || {})
const typeMap: Record<string, string> = {
  'twilio/text': 'text',
  'twilio/quick-reply': 'quick-reply',
  'twilio/list-picker': 'list-picker',
  'twilio/call-to-action': 'call-to-action',
  'twilio/media': 'media',
  'twilio/card': 'call-to-action',
  'whatsapp/authentication': 'text',
  'whatsapp/card': 'call-to-action',
  'whatsapp/list-picker': 'list-picker',
}
let contentType = 'text'
for (const key of typeKeys) {
  if (typeMap[key]) { contentType = typeMap[key]; break }
}

// No upsert:
template_type: contentType, // ao inves de 'text' hardcoded
```

**Linha 341 (submit-approval)** - Manter `/whatsapp` (POST esta correto como esta).

### 2. twilio-whatsapp-setup/index.ts

**Linha 457 (Step 9)** - Remover `/whatsapp` da URL de GET:
```typescript
const approvalUrl = `https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests`
```

**Linha 497 (upsert)** - Mesmo mapeamento de `template_type`.

### 3. Frontend - Adicionar labels para novos tipos

**WhatsAppTemplates.tsx (linha 134)** e **TemplateDetail.tsx** - Adicionar `'authentication'` ao mapa de labels:
```typescript
const labels: Record<string, string> = {
  'text': 'Texto',
  'quick-reply': 'Resposta Rapida',
  'list-picker': 'Lista',
  'call-to-action': 'CTA',
  'media': 'Midia',
  'authentication': 'Autenticacao',
  'card': 'Card',
}
```

## Resumo

| Problema | Causa | Fix |
|----------|-------|-----|
| Todos "Rascunho" | GET usa URL errada (`/whatsapp`) retorna 405 | Remover `/whatsapp` do GET |
| Todos "Texto" | `template_type: 'text'` hardcoded | Mapear de `template.types` |
| Submit funciona | POST para `/ApprovalRequests/whatsapp` esta correto | Nenhuma mudanca |

## Arquivos

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/twilio-whatsapp-templates/index.ts` | Fix URL do GET + mapear template_type |
| `supabase/functions/twilio-whatsapp-setup/index.ts` | Fix URL do GET + mapear template_type |
| `src/pages/settings/WhatsAppTemplates.tsx` | Adicionar labels de tipo |
| `src/pages/whatsapp/TemplateDetail.tsx` | Adicionar labels de tipo |
