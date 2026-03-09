

## Diagnóstico: Mensagens do WhatsApp indo para organização errada

### Causa raiz

O `twilio-whatsapp-setup` tem um bug crítico: quando uma org faz setup, ele configura os webhooks em **TODOS os senders ONLINE** da conta Twilio, não apenas no número selecionado pela org.

```
Central Trabalhista e Viagi compartilham a mesma conta Twilio.

Quando Central Trabalhista fez setup:
1. fetchWhatsAppSenders() → retorna TODOS os senders da conta
2. Loop em v2Senders → atualiza webhook de TODOS os senders ONLINE
3. Resultado: o número da Viagi agora aponta para orgId da Central Trabalhista
```

Linhas 351-363 do `twilio-whatsapp-setup/index.ts`:
```typescript
for (const sender of v2Senders) {
  if (sender.status === "ONLINE" || sender.status === "ONLINE:UPDATING") {
    // ← BUG: atualiza TODOS, não filtra pelo número selecionado
    updateSenderWebhook(sender.sid, inboundWebhookUrl, statusWebhookUrl);
  }
}
```

Mesmo problema nas linhas 412-427 — associa **TODOS** os números ao Messaging Service da org.

### Além disso, o webhook inbound NÃO valida

No `twilio-whatsapp-webhook/index.ts`, o campo `To` (número que recebeu a mensagem) é ignorado. O webhook confia 100% no `orgId` da URL, que pode estar errado por causa do bug acima.

### Plano de correção (2 arquivos)

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/twilio-whatsapp-setup/index.ts` | Filtrar senders e números pelo `selectedNumber` antes de configurar webhooks |
| `supabase/functions/twilio-whatsapp-webhook/index.ts` | Validar que o número `To` pertence à org do `orgId` |

### Detalhes técnicos

**1. Setup — filtrar por número selecionado (linhas 348-363)**

No bloco de setup, após determinar o `selectedNumber`/`primaryNumber`, filtrar os senders para configurar webhook apenas no sender que corresponde ao número da org:

```typescript
// ANTES: configura TODOS os senders
for (const sender of v2Senders) {
  if (sender.status === "ONLINE") {
    updateSenderWebhook(sender.sid, ...)
  }
}

// DEPOIS: configura APENAS o sender do número selecionado
const selectedSenderId = `whatsapp:${selectedNumber || primaryNumber}`;
for (const sender of v2Senders) {
  if ((sender.status === "ONLINE" || sender.status === "ONLINE:UPDATING") 
      && sender.sender_id === selectedSenderId) {
    updateSenderWebhook(sender.sid, ...)
  }
}
```

**2. Setup — associar apenas o número selecionado ao Messaging Service (linhas 412-427)**

```typescript
// ANTES: associa TODOS os números
for (const number of phoneNumbers) { ... }

// DEPOIS: associa apenas o número selecionado
const selectedPhones = phoneNumbers.filter(n => 
  n.phone_number === selectedNumber || n.phone_number === primaryNumber
);
for (const number of selectedPhones) { ... }
```

**3. Webhook inbound — validar o número `To`**

No início do path `/inbound`, após buscar a integration, validar que o `To` corresponde ao número configurado:

```typescript
const configuredNumber = config?.whatsapp_number;
const toNumber = to.replace('+', '');
const configNormalized = configuredNumber?.replace('+', '');

if (configuredNumber && configNormalized !== toNumber) {
  console.warn(`Message To ${to} does not match org configured number ${configuredNumber}. Ignoring.`);
  return new Response('<Response></Response>', { status: 200 });
}
```

### Ação imediata necessária

Após o deploy, será preciso rodar o setup novamente na **Viagi** para reconfigurar o webhook do número dela com o `orgId` correto.

