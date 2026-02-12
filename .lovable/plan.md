

# Atualizar IntegrationDetailDialog para o novo formato da API v2

## Problema

A edge function `check-webhooks` agora retorna senders como objetos detalhados, mas o frontend ainda espera o formato antigo (array de strings).

**Formato antigo (esperado pelo frontend):**
```json
{ "senders": ["whatsapp:+55..."], "is_inbound_configured": true }
```

**Formato novo (retornado pela API v2):**
```json
{
  "senders": [{ "sender_id": "whatsapp:+55...", "sid": "XE...", "status": "ONLINE", "callback_url": "...", "webhook_correct": true }],
  "allCorrect": true
}
```

## Mudancas

### Arquivo: `src/components/settings/IntegrationDetailDialog.tsx`

**1. Atualizar interface `WebhookCheckResult` (linhas 22-32)**

Substituir a interface atual por uma que reflita o novo formato:

```typescript
interface SenderDetail {
  sender_id: string;
  sid: string;
  status: string;
  callback_url?: string;
  status_callback_url?: string;
  webhook_correct: boolean;
}

interface WebhookCheckResult {
  senders: SenderDetail[];
  allCorrect: boolean;
  expectedWebhookUrl?: string;
  // Campos legados mantidos para compatibilidade
  messaging_service_sid?: string | null;
  is_inbound_configured?: boolean;
}
```

**2. Atualizar `handleCheckWebhooks` (linhas 61-80)**

Apos receber `data` da edge function, normalizar os dados:

```typescript
const result: WebhookCheckResult = {
  senders: data.senders || [],
  allCorrect: data.allCorrect || false,
  expectedWebhookUrl: data.expectedWebhookUrl || '',
  is_inbound_configured: data.senders?.some((s: any) => s.webhook_correct) || false,
};
setWebhookResult(result);
```

**3. Atualizar bloco de renderizacao do resultado (linhas 215-249)**

Substituir os StatusItems simples por uma lista detalhada de cada sender:

- Para cada sender, mostrar:
  - Numero (sender_id sem prefixo `whatsapp:`)
  - Status com badge colorida (ONLINE = verde, outro = vermelho)
  - Webhook correto? (CheckCircle2 verde ou XCircle vermelho)
  - URL do callback atual (truncada)
- Manter o botao "Corrigir Webhooks" visivel quando `allCorrect` for `false`

**4. Logica do botao "Corrigir Webhooks"**

Mostrar o botao quando `!webhookResult.allCorrect` ao inves de checar campos individuais antigos.

## Resultado esperado

Ao clicar "Verificar Webhooks", o usuario vera uma lista detalhada com o status de cada WhatsApp Sender, incluindo se o webhook esta configurado corretamente, o status ONLINE/OFFLINE, e a URL configurada.

