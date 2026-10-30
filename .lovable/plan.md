# Nova função somente leitura: client-portal-whatsapp-preview

Mostra ao cliente da Central as últimas mensagens da conversa dele com o Atendimento (7027). Nada no banco é gravado; nenhuma função existente é alterada.

## O que será criado
- `supabase/functions/client-portal-whatsapp-preview/index.ts` — recebe o pedido, consulta e responde.
- `supabase/functions/client-portal-whatsapp-preview/logic.ts` — validação de entrada, filtro e formatação das mensagens (sem acesso ao banco, testável).
- `supabase/functions/client-portal-whatsapp-preview/logic_test.ts` — testes.
- Bloco novo em `supabase/config.toml`: `[functions.client-portal-whatsapp-preview] verify_jwt = false` (único acréscimo a um arquivo existente; necessário para publicar sem JWT, igual à função de código).

## Comportamento
1. Só POST (OPTIONS para CORS). Assinatura HMAC igual à `client-portal-otp-send`, mesmo segredo, 300 s; falha → 401 `{"code":"unauthorized"}`.
2. Entrada `{ seialz_contact_ids: 1–5 UUIDs, limit?: 1–30, padrão 20 }`; inválida → 400 `{"code":"invalid_input"}`.
3. Contatos da organização configurada, sem `deleted_at`.
4. Threads `channel='whatsapp'` e `primary_endpoint_id` = endpoint de Atendimento configurado.
5. Mensagens dessas threads, mais recentes primeiro, até o limite, excluindo nota interna, `direction='internal'`, `sender_type='system'` e mensagens com `deleted_at` [INCERTO: não pedido explicitamente, mas mensagem apagada não deve aparecer ao cliente — confirmar].
6. Retorno por mensagem: `id`, `direction` (inbound/outbound), `body` (null se vazio/só mídia), `media_type` (só image/audio/video/document/sticker; outro valor → null), `created_at`, `sender_label` (primeiro nome do atendente via `users`, ou "Equipe Central"; null para inbound). A consulta nem seleciona `media_urls`.
7. Sem conversa → `{ "messages": [] }`. Erros só `{"code": ...}`; logs sem conteúdo, telefone ou corpo.

## Detalhes técnicos
- Assinatura: importar `verifySignature` de `../client-portal-otp-send/logic.ts` (só leitura do arquivo, sem alterá-lo).
- Filtro também aplicado em código (`logic.ts`) além da consulta, para os testes cobrirem nota interna, internal/system, thread de outro endpoint e ausência de `media_urls`.
- Leitura com service_role, sempre filtrada por `organization_id`.
- Testes Deno: assinatura válida/inválida/expirada, validação de entrada, filtros. Depois publicar a função e testar só sem assinatura (esperado 401), sem consulta real de mensagens.
