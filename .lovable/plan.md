

# Corrigir associacao de WhatsApp Sender ao Messaging Service

## Diagnostico

Os logs confirmam o problema:
- O codigo esta usando a API `/PhoneNumbers` para associar o numero
- Twilio retorna erro **21715: "Number does not have right capabilities"**
- Isso acontece porque o numero e um WhatsApp Sender, nao um PhoneNumber regular

## Solucao

Trocar de volta para a API `/Senders` com a URL e parametros corretos. A documentacao do Twilio Messaging Service Senders usa:

```text
POST https://messaging.twilio.com/v1/Services/{ServiceSid}/Senders
Content-Type: application/x-www-form-urlencoded
Body: Sender=whatsapp:+551150265098&SenderType=whatsapp
```

O problema anterior com 404 pode ter sido causado por falta do parametro `SenderType` ou encoding incorreto.

## Mudancas

### Arquivo: `supabase/functions/twilio-whatsapp-setup/index.ts`

No bloco `update-webhook` (linhas 313-378), substituir a logica de associacao via `/PhoneNumbers` por `/Senders`:

```typescript
// ANTES (errado - usa PhoneNumbers API)
const assocUrl = `https://messaging.twilio.com/v1/Services/${messagingServiceSid}/PhoneNumbers`
body: `PhoneNumberSid=${numberData.sid}`

// DEPOIS (correto - usa Senders API)
const senderValue = `whatsapp:${cleanNumber}`
const assocUrl = `https://messaging.twilio.com/v1/Services/${messagingServiceSid}/Senders`
body: `Sender=${encodeURIComponent(senderValue)}&SenderType=whatsapp`
```

A logica simplifica porque nao precisa mais buscar o PhoneNumber SID primeiro. Basta chamar diretamente a API de Senders com o formato `whatsapp:+55...`.

Tambem aplicar a mesma correcao no setup inicial (Step 5) para que novas integracoes ja funcionem corretamente.

### Resumo de mudancas

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/twilio-whatsapp-setup/index.ts` | Trocar `/PhoneNumbers` por `/Senders` com `SenderType=whatsapp` no mode `update-webhook` e no setup inicial |

