# Adicionar botão "Adicionar número WhatsApp" no lugar certo

O componente `WhatsAppIntegrationStatus.tsx` onde adicionei o botão antes está órfão (não é renderizado). A tela real que o Lucas vê ao clicar "Ver integração" no card Twilio WhatsApp é `src/components/settings/IntegrationDetailDialog.tsx`, função `renderWhatsAppConfig()`.

## Mudança

Em `src/components/settings/IntegrationDetailDialog.tsx`:

1. Importar `AddWhatsAppEndpointDialog` (já existe).
2. Importar ícone `Plus` do phosphor.
3. Adicionar estado `addEndpointOpen`.
4. Em `renderWhatsAppConfig()`, logo após o bloco "Verificar Webhooks" e antes do `<WhatsAppInboundSettings />`, inserir:
   - Botão **"Adicionar número WhatsApp"** (variant default, ícone Plus, full width).
   - `<AddWhatsAppEndpointDialog open={addEndpointOpen} onOpenChange={setAddEndpointOpen} />`.

Nenhuma outra alteração. `AddWhatsAppEndpointDialog.tsx` já está funcional.

## Caminho exato para o usuário

`/settings/integrations` → card **Twilio WhatsApp API** → **Ver integração** → no modal, abaixo de **Verificar Webhooks**, clicar **Adicionar número WhatsApp**.
