
## Diagnóstico

Auditei `src/pages/messages/MessagesList.tsx` e o gate visual (`outOfWindow`, seletor de template, campo desabilitado) já é calculado a partir do `composerEndpoint`, não do `primary_endpoint_id`:

- Linha 685: `composerIsEvolution = composerEndpoint?.provider === 'evolution_api'`
- Linha 2370-2372: `composerBypassesWindow = composerIsEvolution` e `outOfWindow = !serviceWindow.isOpen && messages.length > 0 && !bypassWindow && !composerBypassesWindow`
- O `WhatsAppTemplateSelector` só é renderizado dentro do bloco `outOfWindow`, portanto some automaticamente quando `composerIsEvolution` for verdadeiro.

**A causa real do bug** está em `defaultComposerEndpointId` (linhas 659-670):

```ts
if (selectedThreadBusinessContext === 'sales' && salesEndpoints.length > 0) {
  if (selectedThreadPrimaryEndpointId && isSalesPurpose(primaryEndpointPurpose)) {
    return selectedThreadPrimaryEndpointId;   // ← trava aqui
  }
  return pickPreferredEndpoint(salesEndpoints, 'sales')?.id ?? null;
}
```

Como o `primary_endpoint_id` do Roberto Dexheimer é Meta 2890 e tem `purpose='commercial'` (sales-purpose), a função retorna o próprio 2890. Resultado: composer resolve Meta, `serviceWindow.isOpen=false`, `outOfWindow=true`, seletor de template abre. O branch `shouldMigrate` de fato nunca é avaliado, porque o envio livre já foi bloqueado antes.

## Correção proposta (frontend-only, escopo Evolution)

Ajustar apenas a resolução do `defaultComposerEndpointId` em `MessagesList.tsx`. Nada mais muda: dispatcher, edge functions, Meta e Twilio ficam intactos.

Nova regra dentro do branch `business_context === 'sales'`:

1. Selecionar `evolutionSalesEndpoint` = primeiro endpoint ativo com `provider === 'evolution_api'` e purpose em `SALES_PURPOSES` (usar `filterEndpointsByIntent(orgEndpoints, 'sales')`).
2. Selecionar `preferredSales` = `pickPreferredEndpoint(salesEndpoints, 'sales')`.
3. Decisão:
   - Se `primary` é sales-purpose **e** `serviceWindow.isOpen` → manter `primary` (comportamento atual, preserva continuidade dentro da janela).
   - Senão, se existe `evolutionSalesEndpoint` → retorná-lo (permite envio livre + migração no primeiro send via `shouldMigrate`, que já detecta `composerEndpointId !== primary` e `composerIsEvolution`).
   - Senão, fallback atual: `preferredSales?.id ?? primary ?? null`.

Efeito colateral esperado: quando a thread está dentro da janela 24h, continua respondendo pelo Meta 2890 original (sem migração indesejada). Quando está fora da janela e há Evolution comercial ativo, o composer nasce Evolution e o primeiro envio migra a thread — exatamente o fluxo pedido para o Roberto Dexheimer.

Nenhuma mudança em: `dispatchWhatsAppSend`, `thread-migrate-endpoint-send`, `meta-whatsapp-send`, `twilio-whatsapp-send`, `resolveComposerProvider`, `useThreadSendEndpoint`, `serviceWindow`, gate `outOfWindow`, seletor de template.

## Arquivo tocado

- `src/pages/messages/MessagesList.tsx` — reescrever apenas o bloco `defaultComposerEndpointId` (linhas 659-670). ~10 linhas.

## Validação manual (Roberto Dexheimer)

1. Contato → Conversas → Abrir conversa comercial.
2. Composer deve resolver Evolution 8439 (badge do endpoint no header).
3. Não deve aparecer o seletor de template; campo de texto habilitado.
4. Aviso "Sem inbound recente — envio livre pelo Evolution" visível.
5. Primeiro envio chama `migrateThreadAndSend` (log no console + evento `THREAD_PROVIDER_MIGRATED`).
6. F5 mantém composer no 8439 (agora é o novo `primary_endpoint_id`).
7. Abrir outra thread comercial **dentro** da janela 24h com primary Meta: composer deve continuar Meta (não migrar espontaneamente).
8. Aba Atendimento não muda: continua usando endpoint customer_service.
