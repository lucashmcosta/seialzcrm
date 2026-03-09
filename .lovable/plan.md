

## Diagnóstico: Caller ID errado entre organizações

### O que encontrei

**Central Trabalhista** e **Viagi** compartilham a **mesma conta Twilio** (`ACb2329...d47e`), cada uma com seu próprio número:
- Central Trabalhista: `+551150286860` (TwiML App: `AP68e5...`)
- Viagi: `+551140403128` (TwiML App: `AP5b87...`)

Os dados no banco estão corretos -- cada org tem o `phone_number` e `twiml_app_sid` certos.

### Causa raiz: Bug no path `/twiml` (chamadas legacy)

No arquivo `supabase/functions/twilio-webhook/index.ts`, linhas 361-365, o path `/twiml` busca o caller ID assim:

```typescript
const { data: integration } = await supabase
  .from('organization_integrations')
  .select('config_values')
  .eq('organization_id', orgId)
  .single()  // ← BUG: não filtra por integration_id!
```

Como a Central Trabalhista tem **2 integrações** (twilio-voice + twilio-whatsapp), o `.single()` pode retornar a integração errada ou falhar silenciosamente, fazendo o `callerId` ficar vazio ou incorreto.

Além disso, há um **segundo problema potencial**: quando a Central Trabalhista fez o setup, o `twilio-setup` atualizou o `VoiceApplicationSid` do número `+551150286860` na conta Twilio. Porém, como ambas as orgs compartilham a mesma conta Twilio, se uma fez setup depois da outra no mesmo número, pode ter sobrescrito configurações.

### Plano de correção

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/twilio-webhook/index.ts` | Corrigir path `/twiml` para filtrar por `integration_id` do twilio-voice (mesmo padrão do path `/voice`) |
| `supabase/functions/twilio-webhook/index.ts` | Corrigir path `/voice` para adicionar fallback caso `orgId` não venha na URL |

### Detalhes técnicos

**Correção no `/twiml`** (linhas 360-370): Buscar primeiro o `admin_integrations.id` do slug `twilio-voice`, depois filtrar `organization_integrations` por `integration_id` -- exatamente como já é feito no path `/voice` (linhas 300-318).

```typescript
// ANTES (bugado):
.eq('organization_id', orgId).single()

// DEPOIS (correto):
const { data: twilioIntegration } = await supabase
  .from('admin_integrations')
  .select('id')
  .eq('slug', 'twilio-voice')
  .single()

const { data: integration } = await supabase
  .from('organization_integrations')
  .select('config_values')
  .eq('organization_id', orgId)
  .eq('integration_id', twilioIntegration.id)
  .eq('is_enabled', true)
  .single()
```

Isso garante que o caller ID sempre vem da integração de voz, não da de WhatsApp.

