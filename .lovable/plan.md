

## Correção: CORS headers na edge function `twilio-whatsapp-send`

### Problema
Os headers CORS atuais (linha 6) são:
```
'authorization, x-client-info, apikey, content-type'
```

Faltam os headers que o Supabase JS SDK v2.86+ envia automaticamente:
- `x-supabase-client-platform`
- `x-supabase-client-platform-version`  
- `x-supabase-client-runtime`
- `x-supabase-client-runtime-version`

O browser bloqueia a requisição no preflight porque esses headers não são aceitos.

### Alteração

**Arquivo:** `supabase/functions/twilio-whatsapp-send/index.ts` (linha 6)

Atualizar o `Access-Control-Allow-Headers` para incluir todos os headers necessários:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}
```

Uma única linha alterada, sem mudança de lógica.

