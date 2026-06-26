## Problema

Hoje o botão "Conectar" sempre chama a Graph API da Meta pra validar Phone Number ID + WABA + Token antes de salvar. Se a Meta recusa (mesmo que os dados estejam corretos do seu lado), nada é gravado — então você não consegue só trocar o número e o Phone Number ID de uma conexão já existente.

## O que vou fazer

Permitir **editar** uma conexão Meta WhatsApp Cloud já existente sem precisar passar pela validação Graph API.

### 1. Edge function `meta-whatsapp-connect`
- Aceitar uma flag `skipMetaValidation: true` no body.
- Quando ela vier:
  - Pular a chamada `validateCredentials` (sem `/me`, sem `/{phone_number_id}`, sem checagem de WABA).
  - Gravar/atualizar `organization_integrations` e `communication_endpoints` direto com os valores enviados (App ID, WABA ID, Phone Number ID, telefone E.164, token).
  - Preencher `display_phone_number` com o E.164 informado, e deixar `verified_name`/`quality_rating`/`messaging_limit_tier` como `null` (ou manter os antigos, se já existirem).

### 2. UI `MetaWhatsAppCloudDialog`
- Quando a organização já tem integração conectada, mostrar um modo "Editar conexão" com os campos pré-preenchidos.
- Adicionar um botão secundário **"Salvar sem validar na Meta"** que chama o connect com `skipMetaValidation: true`.
- O botão principal "Conectar / Validar" continua funcionando do jeito atual pra quem quer revalidar.

### 3. Service `metaWhatsAppService.connect`
- Adicionar `skipMetaValidation?: boolean` em `ConnectInput` e repassar pro edge function.

## Detalhes técnicos

- Arquivos tocados:
  - `supabase/functions/meta-whatsapp-connect/index.ts`
  - `src/services/metaWhatsAppService.ts`
  - `src/components/integrations/meta-whatsapp-cloud/MetaWhatsAppCloudDialog.tsx`
- Sem mudança de schema, sem migration.
- Segurança: a checagem de membership na organização continua igual — só pulamos a chamada externa à Meta.

Confirma que é isso? Se sim, eu implemento.
