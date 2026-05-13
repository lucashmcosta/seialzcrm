# Corrigir prompt de login do Twilio em /messages

## Problema

O navegador está abrindo um popup "Fazer login — https://api.twilio.com" ao abrir a página de mensagens. Isso acontece porque algumas mensagens de áudio têm `media_urls` apontando direto para `https://api.twilio.com/.../Media/...`. O elemento `<audio src=...>` faz a requisição direto, a Twilio responde `401 WWW-Authenticate: Basic`, e o Chrome mostra o diálogo de credenciais.

Não há referência a `api.twilio.com` no código frontend — as URLs vêm do banco (`messages.media_urls`), provavelmente populadas pelo webhook do Twilio antes de termos um proxy/download.

## Solução

Criar uma edge function que faz proxy da mídia do Twilio (autenticando server-side com as credenciais da organização) e usar essa URL no player.

### 1. Edge function `twilio-media-proxy`
- Recebe: `?messageSid=...&mediaSid=...&orgId=...` (ou um caminho codificado)
- Valida sessão do usuário e que ele pertence à `orgId`
- Busca credenciais Twilio (Account SID + Auth Token) da `organization_integrations` da org
- Faz `fetch` em `https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages/{messageSid}/Media/{mediaSid}` com `Authorization: Basic ...`
- Twilio responde com redirect 307 para a URL real do CDN — seguir o redirect e fazer streaming do `Body`/`Content-Type` de volta
- Adicionar `Cache-Control: private, max-age=3600`

### 2. Helper frontend `getProxiedMediaUrl(url, orgId)`
- Se a URL contém `api.twilio.com`, extrair `messageSid`/`mediaSid` via regex e retornar a URL da edge function
- Caso contrário, retornar a URL original (mídias já hospedadas em outro lugar continuam funcionando)

### 3. Aplicar no `WhatsAppChat.tsx` (linha ~344)
- Mapear cada `url` em `message.media_urls` por `getProxiedMediaUrl(url, organization.id)` antes de passar para `AudioMessagePlayer` / `<img>` / `<video>`

## Arquivos afetados

- `supabase/functions/twilio-media-proxy/index.ts` (novo)
- `supabase/config.toml` (registrar a function como pública)
- `src/lib/mediaProxy.ts` (novo helper)
- `src/components/whatsapp/WhatsAppChat.tsx` (usar o helper ao renderizar mídia)

## O que NÃO muda

- Schema do banco — `media_urls` continua armazenando a URL original da Twilio
- Webhook de inbound do Twilio
- Lógica de envio de mensagens
- Outros componentes/players que não estejam consumindo `media_urls` do Twilio
