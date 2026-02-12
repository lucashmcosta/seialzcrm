
# Adicionar botao "Verificar Webhooks" no dialog de detalhes da integracao WhatsApp

## Problema

O botao "Verificar Webhooks" foi criado no componente `WhatsAppIntegrationStatus`, mas esse componente nao e usado em nenhuma pagina. O dialog que realmente aparece quando voce clica na integracao WhatsApp e o `IntegrationDetailDialog` (o que aparece na sua screenshot).

## Solucao

Adicionar a funcionalidade de verificacao e correcao de webhooks diretamente dentro do `IntegrationDetailDialog.tsx`, na secao `renderWhatsAppConfig()`.

## Mudancas

### Arquivo: `src/components/settings/IntegrationDetailDialog.tsx`

1. Adicionar estados para controle do check/fix de webhooks
2. Adicionar funcao `handleCheckWebhooks` que chama a edge function com `mode: 'check-webhooks'`
3. Adicionar funcao `handleFixWebhooks` que chama com `mode: 'update-webhook'`
4. Na secao `renderWhatsAppConfig()`, adicionar:
   - Botao **"Verificar Webhooks"** abaixo das informacoes de configuracao
   - Resultado visual com indicadores verde/vermelho mostrando se inbound esta configurado corretamente
   - Botao **"Corrigir Webhooks"** que aparece apenas quando ha problemas detectados
   - Lista de senders associados ao Messaging Service

O resultado visual ficara assim no dialog:

```text
Numero Principal      (11) 5026-5098
Messaging Service     ...48a2024e
Webhooks              Configurados automaticamente
Configurado em        11/02/2026 as 21:20

[Verificar Webhooks]

--- Apos clicar ---
Inbound Webhook       OK (ou Incorreto)
Senders               whatsapp:+5511... (ou Nenhum)
[Corrigir Webhooks]   (aparece se houver problema)
```

### Detalhes tecnicos

A funcao de verificacao chamara:
```typescript
const response = await supabase.functions.invoke('twilio-whatsapp-setup', {
  body: {
    mode: 'check-webhooks',
    organizationId: orgIntegration.organization_id,
    accountSid: configValues.account_sid,
    authToken: configValues.auth_token,
  }
})
```

E exibira o resultado com os campos `is_inbound_configured`, `senders`, e `webhooks` retornados pela edge function.

### Arquivo a remover (opcional)

O componente `WhatsAppIntegrationStatus.tsx` pode ser removido ja que sua funcionalidade sera incorporada diretamente no `IntegrationDetailDialog`. Mas podemos manter por enquanto para nao quebrar nada.

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/settings/IntegrationDetailDialog.tsx` | Adicionar verificacao e correcao de webhooks na secao WhatsApp |
