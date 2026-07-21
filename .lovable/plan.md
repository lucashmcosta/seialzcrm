## Objetivo

Permitir enviar a primeira mensagem pelo Evolution `8439` em uma thread hoje ligada ao Meta `2890` (fora da janela 24h). Após sucesso confirmado, a mesma thread migra permanentemente para o endpoint Evolution, preservando o histórico. Falha de envio não migra nada.

## 1. Novo Edge Function: `thread-migrate-endpoint-send`

Ponto único que faz **envio + migração atômica** com validação server-side. Frontend não toca em `message_threads` nem cria nota.

### Entrada
```
{
  organizationId: string,
  threadId: string,
  targetEndpointId: string,   // endpoint Evolution
  message: string,
  userId?: string,
  replyToMessageId?: string,
}
```

### Fluxo

1. **Auth**: valida JWT do usuário (`Authorization: Bearer`), resolve `organization_id` via `user_organizations`.
2. **Validações do targetEndpoint** (fail-closed):
   - existe;
   - `organization_id === payload.organizationId`;
   - `channel = 'whatsapp'`;
   - `provider = 'evolution_api'`;
   - `is_active = true`;
   - `status != 'offline'`;
   - `purpose` compatível com o `business_context` da thread (ou fallback: qualquer Evolution ativo da org quando ambíguo — mesma regra usada hoje em `useOrgWhatsAppEndpoints`).
3. **Validação da thread**: existe, `organization_id` bate, `channel = 'whatsapp'`, carrega `primary_endpoint_id` atual (para nota + fallback em caso de erro).
4. **Envio primeiro**: chama `evolution-whatsapp-send` via fetch direto (mesmo padrão do dispatcher), passando `endpointId = targetEndpointId`. **Não** invoca `dispatchWhatsAppSend` para não bater na regra dura.
5. **Se envio falhou** (`!res.ok` ou body com `error`): retorna `{ error, migrated: false }`. Nada muda no banco.
6. **Se envio ok**: dentro do mesmo request, executa em sequência (idempotente):
   - `UPDATE message_threads SET primary_endpoint_id = <target>, updated_at = now() WHERE id = <thread> AND organization_id = <org>`.
   - Insere uma **única** mensagem `direction='internal'`, `sender_type='system'`, `metadata.kind='THREAD_PROVIDER_MIGRATED'`, com lookup idempotente prévio (`.contains('metadata', { kind: 'THREAD_PROVIDER_MIGRATED', from_endpoint_id, to_endpoint_id })`). Texto:
     > `Conversa migrada do número Meta ••••<last4Meta> para o Evolution ••••<last4Evo> após envio explícito pelo novo número.`
   - Metadata da nota inclui `from_endpoint_id`, `to_endpoint_id`, `from_provider`, `to_provider`, `migrated_at`, `migration_kind='explicit_free_type_via_evolution'`, `migrated_by_user_id`.
7. Retorna `{ migrated: true, messageId, newPrimaryEndpointId }`.

### Segurança
- `verify_jwt` validado em código; sem service role no browser.
- Nenhum `endpointId` do frontend é aceito sem passar por toda a whitelist acima.
- Falha em qualquer validação → 4xx com mensagem clara, sem envio.

## 2. `src/lib/dispatchWhatsAppSend.ts`

Nenhuma nova flag "genérica". A regra dura anti cross-number (linhas 263–289) permanece **intocada**. O caminho de migração é uma função **separada**, não um bypass do dispatcher.

Adicionar apenas um wrapper de conveniência exportado (novo arquivo `src/lib/migrateThreadAndSend.ts`) que invoca a nova Edge Function acima e devolve `{ data, error }` no mesmo shape usado pela UI.

## 3. `src/pages/messages/MessagesList.tsx`

- **Label do botão**: trocar `"digitar livre pelo <num>"` por:
  - pt-BR: `Enviar pelo <last4> e migrar conversa`
  - en: `Send via <last4> and migrate thread`
  - Tooltip explica: "A conversa passará a operar pelo número Evolution. Histórico preservado."
- **Handler de envio**: quando `bypassWindow === true` **e** a thread não é nativamente Evolution:
  - chamar `migrateThreadAndSend({ organizationId, threadId, targetEndpointId: evolutionEndpoint.id, message, userId, replyToMessageId })` em vez de `dispatchWhatsAppSend`.
  - Em sucesso: `refetchThreads()`, limpar `bypassWindow`, limpar `composerEndpointId` (a próxima resolução por `primary_endpoint_id` já apontará para Evolution naturalmente), limpar `messageText` e `replyingTo`.
  - Em erro: manter tudo como está (mensagem no composer, thread intocada), exibir toast com o erro real.
- Quando a thread **já é** Evolution nativa (Alba etc.), continuar chamando `dispatchWhatsAppSend` normal — sem migração.
- Não mudar mais nada no arquivo.

## 4. Escopo restrito

**Não alterar**: `MobileMessagesList`, `ContactMessages`, `WhatsAppChat`, `InboxComposer`, `meta-whatsapp-send`, `twilio-whatsapp-send`, `evolution-whatsapp-send`, `evolution-webhook`, comportamento padrão de `dispatchWhatsAppSend`, nenhuma migration de banco, nenhuma RLS.

## 5. Deploy e validação no piloto Viagi

Após deploy da Edge Function e do frontend, validar em uma thread real Viagi ligada ao Meta `2890`, fora da janela 24h:

1. Clicar em "Enviar pelo 8439 e migrar conversa".
2. Confirmar entrega no WhatsApp do destinatário via +8439.
3. Confirmar que o seletor de templates **não** abriu.
4. `supabase--read_query` em `message_threads`: `primary_endpoint_id` = endpoint Evolution.
5. Histórico permanece na mesma `thread_id` (sem duplicação).
6. `supabase--read_query` em `messages`: exatamente uma nota `metadata.kind = 'THREAD_PROVIDER_MIGRATED'` para o par (thread, endpoints).
7. Após reload da página, o cabeçalho da thread mostra `8439 / evolution_api`.
8. Segundo envio livre (sem clicar em nada) sai pelo Evolution.
9. Simular falha (payload inválido no Edge): confirmar que `primary_endpoint_id` **não** muda, nota **não** é criada, UI mostra erro.

## Arquivos tocados

- `supabase/functions/thread-migrate-endpoint-send/index.ts` — novo.
- `src/lib/migrateThreadAndSend.ts` — novo (wrapper client-side).
- `src/pages/messages/MessagesList.tsx` — label do botão + roteamento do handler.