

# Fix: Extrair body e botoes do tipo correto do Twilio

## Problema

O body e sempre extraido de `types['twilio/whatsapp'] || types['twilio/text']`, que e vazio para templates Quick Reply, CTA, etc. Tambem nao ha coluna no banco para armazenar botoes/acoes.

## Mudancas

### 1. Migracao: Adicionar coluna `metadata` JSONB

```sql
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
```

Essa coluna armazenara botoes, acoes e outros dados extras do template.

### 2. Edge Functions: Extrair body do tipo correto

Em ambos os arquivos (`twilio-whatsapp-templates/index.ts` e `twilio-whatsapp-setup/index.ts`), substituir:

```typescript
const whatsappType = types['twilio/whatsapp'] || types['twilio/text'] || {}
```

Por logica que itera todos os tipos possiveis:

```typescript
const types = template.types || {}
let extractedBody = ''
let buttons: any[] = []
let actions: any[] = []
let header = ''
let footer = ''

if (types['twilio/quick-reply']) {
  extractedBody = types['twilio/quick-reply'].body || ''
  buttons = (types['twilio/quick-reply'].actions || []).map((a: any) => ({ title: a.title, id: a.id }))
} else if (types['twilio/call-to-action']) {
  extractedBody = types['twilio/call-to-action'].body || ''
  actions = (types['twilio/call-to-action'].actions || []).map((a: any) => ({
    type: a.type, title: a.title, url: a.url, phone: a.phone
  }))
} else if (types['twilio/list-picker']) {
  extractedBody = types['twilio/list-picker'].body || ''
  actions = types['twilio/list-picker'].items || []
} else if (types['twilio/card'] || types['whatsapp/card']) {
  const card = types['twilio/card'] || types['whatsapp/card']
  extractedBody = card.body || card.title || ''
  actions = card.actions || []
} else if (types['whatsapp/authentication']) {
  extractedBody = types['whatsapp/authentication'].body || 'Authentication template'
} else if (types['twilio/media']) {
  extractedBody = types['twilio/media'].body || ''
} else if (types['twilio/text']) {
  extractedBody = types['twilio/text'].body || ''
}
```

No upsert:

```typescript
body: extractedBody,
metadata: { buttons, actions, header, footer },
```

Aplicar em 3 locais:
- `twilio-whatsapp-templates/index.ts` bloco GET sync (linha ~79-142)
- `twilio-whatsapp-templates/index.ts` bloco POST sync (linha ~237-300)
- `twilio-whatsapp-setup/index.ts` Step 9 (linha ~446-507)

### 3. Frontend: TemplateDetail.tsx

Ler `metadata` do template e passar botoes/acoes para o `WhatsAppPreview`:

```typescript
const metadata = template.metadata || {}
const buttons = metadata.buttons || []
const actions = metadata.actions || []

<WhatsAppPreview
  body={template.body}
  header={template.header}
  footer={template.footer}
  variables={template.variables || []}
  buttons={buttons}
  actions={actions}
/>
```

### 4. Deploy

Deploy das duas edge functions apos as mudancas.

## Arquivos

| Arquivo | Mudanca |
|---------|---------|
| Migration SQL | Adicionar coluna `metadata` JSONB |
| `supabase/functions/twilio-whatsapp-templates/index.ts` | Extrair body/buttons/actions do tipo correto (2 blocos) |
| `supabase/functions/twilio-whatsapp-setup/index.ts` | Extrair body/buttons/actions do tipo correto (1 bloco) |
| `src/pages/whatsapp/TemplateDetail.tsx` | Ler metadata para passar buttons/actions ao preview |

