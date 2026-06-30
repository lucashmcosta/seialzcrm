## Problema

Os templates Meta são gravados em `whatsapp_templates` (5 confirmados no DB com `provider='meta_cloud_api'`), mas a listagem na UI chama `whatsappService.listTemplates`, que bate em `https://seialz-backend-production.up.railway.app/api/whatsapp/templates`. Esse endpoint Railway retorna apenas templates Twilio, então os Meta ficam invisíveis na tela.

## Correção (mínima, escopo restrito)

Sem mexer em Railway, Twilio, composer, dispatcher, envio ou schema.

### Mudança única: `src/hooks/useWhatsAppTemplates.ts` → `useTemplates`

Fazer fetch paralelo:

1. **Twilio** (como hoje): `whatsappService.listTemplates(orgId)` — mantém compatibilidade total com fluxo Railway.
2. **Meta** (novo): `supabase.from('whatsapp_templates').select('*').eq('organization_id', orgId).eq('provider', 'meta_cloud_api').eq('is_active', true)` — direto no Supabase (RLS já protege).

Concatenar os dois arrays, deduplicar por `id` (Twilio tem prioridade caso colida — não deve colidir), aplicar o filtro `is_active !== false` já existente, e ordenar por `created_at desc`.

### Por que assim

- Railway-side não retorna Meta e não temos permissão de mexer nele agora.
- Supabase direto resolve só o lado Meta; o Twilio continua exatamente como está.
- Realtime subscription existente já cobre INSERT/UPDATE/DELETE dos dois providers — sem mudança.
- Componentes (`WhatsAppTemplates.tsx`, badges, dropdowns, tooltip de rejeição) já tratam `provider='meta_cloud_api'` — nada muda lá.

### Fora de escopo

- Não mudar `src/services/whatsapp.ts` (mantém contrato Railway).
- Não mudar Railway, dispatcher, composer, envio.
- Não mudar schema.
- Detail page (`useTemplate`) fica para depois se aparecer o mesmo sintoma — hoje o usuário só relatou a listagem.

## Validação

1. Recarregar `/settings/whatsapp-templates` → devem aparecer os 5 Meta + os Twilio existentes.
2. Filtro "Meta Cloud" → mostra os 5.
3. Filtro "Twilio" → mostra os 137 Twilio.
4. Criar novo template Meta → aparece imediatamente via realtime.
