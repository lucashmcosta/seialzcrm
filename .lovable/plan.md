## Objetivo
Eliminar de vez a janela de login do Twilio nas telas de mensagens e fazer os áudios voltarem a tocar corretamente, inclusive para conversas antigas e views secundárias.

## O que vou implementar
1. **Unificar o uso do proxy de mídia do Twilio em todas as telas ativas**
   - Aplicar `getProxiedMediaUrl(...)` não só no `WhatsAppChat`, mas também em:
     - `src/pages/messages/MessagesList.tsx`
     - `src/components/mobile/MobileMessagesList.tsx`
     - `src/components/contacts/ContactMessages.tsx`
   - Isso cobre a rota `/messages`, mobile e abas de mensagens dentro de contato/oportunidade, que hoje ainda usam a URL original do Twilio em alguns pontos.

2. **Tornar o proxy mais robusto para áudio do navegador**
   - Ajustar o edge function `twilio-media-proxy` para responder melhor a players nativos de `<audio>`:
     - preservar headers importantes de mídia
     - suportar requisições parciais/range quando necessário
     - manter CORS consistente em respostas de sucesso e erro
   - Revisar o formato da URL proxied para evitar casos em que o browser ainda tente abrir `api.twilio.com` diretamente.

3. **Melhorar o comportamento do player quando a mídia falhar**
   - Atualizar `AudioMessagePlayer` para lidar melhor com erro de carregamento, evitando estado “travado” após cancelar o popup.
   - Garantir feedback visual simples quando um áudio específico não puder ser carregado.

4. **Validar o fluxo completo**
   - Conferir a rota `/messages` (desktop/mobile) e as views embutidas de mensagens em contato/oportunidade.
   - Validar que clicar em play não dispara mais autenticação do Twilio e que os áudios problemáticos passam a tocar via proxy.

## Diagnóstico encontrado
- O chat principal `WhatsAppChat` já usa proxy.
- Outras telas ainda renderizam `message.media_urls` diretamente no `AudioMessagePlayer`.
- Isso explica por que o problema continua “em alguns clientes” e não em todos os lugares.
- O edge function `twilio-media-proxy` não mostrou logs recentes, então a maior suspeita agora é cobertura incompleta no frontend, com reforço pontual no proxy para compatibilidade de streaming.

## Detalhes técnicos
- Arquivos-alvo principais:
  - `src/lib/mediaProxy.ts`
  - `supabase/functions/twilio-media-proxy/index.ts`
  - `src/pages/messages/MessagesList.tsx`
  - `src/components/mobile/MobileMessagesList.tsx`
  - `src/components/contacts/ContactMessages.tsx`
  - `src/components/whatsapp/AudioMessagePlayer.tsx`
- Não vou alterar regra de negócio de mensagens nem estrutura de banco.
- O foco é só corrigir carregamento/reprodução de mídia Twilio no frontend + proxy.