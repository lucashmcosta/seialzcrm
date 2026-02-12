

# Configurar Webhook de Inbound Automaticamente no Setup do WhatsApp

## Analise da Arquitetura Atual

Apos investigar o codigo, descobri que:

1. **O setup JA configura webhooks automaticamente** - O `twilio-whatsapp-setup/index.ts` (linhas 137-246, 327-351) ja:
   - Define `inboundWebhookUrl` e `statusWebhookUrl`
   - Cria/atualiza o Messaging Service com esses webhooks (incluindo `UseInboundWebhookOnNumber=true`)
   - Configura webhooks diretamente nos numeros como fallback (SmsUrl)
   - Salva as URLs nos `config_values` da integracao

2. **O Railway NAO recebe webhooks** - O backend Railway (`seialz-backend-production.up.railway.app`) e usado apenas para operacoes CRUD de templates (listar, criar, editar). NAO recebe webhooks do Twilio.

3. **O AI Agent e chamado APOS o webhook** - O fluxo atual e:

```text
Twilio --POST--> Edge Function (twilio-whatsapp-webhook/inbound)
                      |
                      +--> Salva mensagem no banco
                      +--> Atualiza thread (whatsapp_last_inbound_at)
                      +--> Se AI Agent ativo: chama ai-agent-respond (async)
```

Nao ha necessidade de trocar webhooks quando AI Agent e ativado/desativado.

## O Que Realmente Precisa Ser Feito

O setup ja esta correto. O problema de "mensagens inbound nao chegam" reportado anteriormente NAO e um problema de codigo - e um problema de configuracao no Twilio. Possiveis causas:

1. O numero WhatsApp nao esta registrado como WhatsApp Sender no Twilio
2. O Messaging Service nao esta associado ao WhatsApp Sandbox
3. O WhatsApp Sandbox tem webhook proprio que sobrepoe o do Messaging Service

### Mudanca 1: Adicionar modo `check-webhooks` para diagnostico

Adicionar um novo mode na edge function `twilio-whatsapp-setup` que verifica se os webhooks estao configurados corretamente no Twilio e retorna o status para o frontend.

```text
mode: 'check-webhooks'
  -> Busca Messaging Service da org
  -> Verifica InboundRequestUrl configurada
  -> Verifica senders associados
  -> Retorna status detalhado
```

### Mudanca 2: Adicionar modo `update-webhook` para reconfigurar

Para os casos onde o usuario ativa/desativa AI Agent e quer que o webhook mude (caso futuro onde Railway receba webhooks), adicionar um mode que atualiza a URL do webhook no Messaging Service.

```text
mode: 'update-webhook'
  -> Recebe: organizationId, webhookUrl (opcional)
  -> Se webhookUrl nao fornecida, usa URL padrao do Supabase
  -> Atualiza Messaging Service + numero
  -> Salva nova URL nos config_values
```

### Mudanca 3: Botao "Verificar Webhooks" no frontend

Na tela de configuracoes do WhatsApp, adicionar um botao que chama o `check-webhooks` e mostra ao usuario se tudo esta configurado corretamente.

## Detalhes Tecnicos

### Arquivo: `supabase/functions/twilio-whatsapp-setup/index.ts`

**Novo bloco `check-webhooks`** (apos o bloco `list-numbers`):

```typescript
if (mode === 'check-webhooks') {
  // Buscar config da org no banco
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  
  const { data: integration } = await supabase
    .from('organization_integrations')
    .select('config_values, admin_integrations!inner(slug)')
    .eq('organization_id', organizationId)
    .eq('admin_integrations.slug', 'twilio-whatsapp')
    .single()
  
  const configValues = integration?.config_values as any
  const messagingServiceSid = configValues?.messaging_service_sid
  
  let serviceWebhooks = null
  let senders: string[] = []
  
  if (messagingServiceSid) {
    // Buscar config atual do Messaging Service
    const serviceResp = await fetch(
      `https://messaging.twilio.com/v1/Services/${messagingServiceSid}`,
      { headers: { 'Authorization': authHeader } }
    )
    if (serviceResp.ok) {
      const serviceData = await serviceResp.json()
      serviceWebhooks = {
        inbound_request_url: serviceData.inbound_request_url,
        status_callback: serviceData.status_callback,
        use_inbound_webhook_on_number: serviceData.use_inbound_webhook_on_number,
      }
    }
    
    // Buscar senders
    const sendersResp = await fetch(
      `https://messaging.twilio.com/v1/Services/${messagingServiceSid}/Senders?PageSize=100`,
      { headers: { 'Authorization': authHeader } }
    )
    if (sendersResp.ok) {
      const sendersData = await sendersResp.json()
      senders = (sendersData.senders || []).map((s: any) => s.sender)
    }
  }
  
  const expectedInboundUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/inbound?orgId=${organizationId}`
  
  return new Response(JSON.stringify({
    success: true,
    messaging_service_sid: messagingServiceSid,
    webhooks: serviceWebhooks,
    senders,
    expected_inbound_url: expectedInboundUrl,
    is_inbound_configured: serviceWebhooks?.inbound_request_url === expectedInboundUrl,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
```

**Novo bloco `update-webhook`**:

```typescript
if (mode === 'update-webhook') {
  const { webhookUrl } = body
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  
  const { data: integration } = await supabase
    .from('organization_integrations')
    .select('config_values, admin_integrations!inner(slug)')
    .eq('organization_id', organizationId)
    .eq('admin_integrations.slug', 'twilio-whatsapp')
    .single()
  
  const configValues = integration?.config_values as any
  const messagingServiceSid = configValues?.messaging_service_sid
  const newInboundUrl = webhookUrl || `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/inbound?orgId=${organizationId}`
  const statusUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/status?orgId=${organizationId}`
  
  if (messagingServiceSid) {
    await fetch(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        InboundRequestUrl: newInboundUrl,
        InboundMethod: 'POST',
        StatusCallback: statusUrl,
        UseInboundWebhookOnNumber: 'true',
      }).toString(),
    })
  }
  
  // Atualizar config_values no banco
  await supabase
    .from('organization_integrations')
    .update({
      config_values: {
        ...configValues,
        inbound_webhook_url: newInboundUrl,
        webhook_mode: webhookUrl ? 'custom' : 'edge-function',
      }
    })
    .eq('organization_id', organizationId)
    .eq('integration_id', integration?.id)
  
  return new Response(JSON.stringify({
    success: true,
    inbound_webhook_url: newInboundUrl,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
```

### Arquivo: `src/components/settings/WhatsAppIntegrationStatus.tsx`

Adicionar botao "Verificar Webhooks" que chama o mode `check-webhooks` e mostra resultado com indicadores visuais (verde = ok, vermelho = problema).

### Arquivo: `src/components/settings/AIAgentSettings.tsx`

No `handleToggle`, apos ativar/desativar o agente, chamar `update-webhook` se necessario (para cenario futuro com Railway).

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/twilio-whatsapp-setup/index.ts` | Adicionar modes `check-webhooks` e `update-webhook` |
| `src/components/settings/WhatsAppIntegrationStatus.tsx` | Adicionar botao de verificacao de webhooks |

## Nota Importante

O setup atual JA configura webhooks corretamente. Se mensagens inbound nao estao chegando, o problema mais provavel e que o numero WhatsApp no Twilio esta usando o Sandbox, que tem configuracoes de webhook SEPARADAS do Messaging Service. O modo `check-webhooks` vai ajudar a diagnosticar isso mostrando exatamente o que esta configurado no Twilio.

