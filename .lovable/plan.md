## Correção: 409 → MigrateEndpointDialog no `AddMetaWhatsAppNumberDialog`

A cadeia 409 → `EndpointAlreadyRegisteredError` → `MigrateEndpointDialog` já funciona em `MetaWhatsAppCloudDialog`. Falta replicá-la no `AddMetaWhatsAppNumberDialog`, único caminho hoje que cai no toast genérico "Falha ao adicionar: …".

## Escopo

Apenas frontend, único arquivo:

- `src/components/integrations/meta-whatsapp-cloud/AddMetaWhatsAppNumberDialog.tsx`

Não tocar em: Edge Functions, banco, `metaWhatsAppService`, `MigrateEndpointDialog`, `MetaWhatsAppCloudDialog`, regras de migração.

## Alterações

1. **Imports**
   - Adicionar `EndpointAlreadyRegisteredError` ao import de `@/services/metaWhatsAppService`.
   - Importar `MigrateEndpointDialog` de `./MigrateEndpointDialog`.

2. **Estado local**
   ```ts
   const [migrateOpen, setMigrateOpen] = useState(false);
   const [existingInfo, setExistingInfo] = useState<{
     endpointId: string;
     provider: string;
     senderSid: string | null;
   } | null>(null);
   ```
   (`senderSid` como `string | null` para casar com o tipo de `MigrateEndpointDialog.existing` e com `EndpointAlreadyRegisteredInfo.existing_sender_sid`.)

3. **`addMutation.onError`** — adicionar, antes do branch `MetaWhatsAppValidationError`:
   ```ts
   if (e instanceof EndpointAlreadyRegisteredError) {
     setExistingInfo({
       endpointId: e.info.existing_endpoint_id,
       provider: e.info.existing_provider,
       senderSid: e.info.existing_sender_sid,
     });
     setMigrateOpen(true);
     toast.message("Número já existe nesta organização", {
       description: `Provider atual: ${e.info.existing_provider}. Use o diálogo de migração para trocar o provider preservando o histórico.`,
     });
     return;
   }
   ```
   Demais branches (`MetaWhatsAppValidationError`, `waba_mismatch`, `integration_not_connected`, genérico) permanecem idênticos.

4. **JSX** — renderizar `<MigrateEndpointDialog>` ao lado do `<Dialog>` principal (envolver retorno em fragmento `<>…</>`):
   ```tsx
   {existingInfo && (
     <MigrateEndpointDialog
       open={migrateOpen}
       onOpenChange={setMigrateOpen}
       existing={existingInfo}
       payload={{
         organizationId,
         wabaId,
         appId,
         phoneNumberId: phoneNumberId.trim(),
         phoneE164: phoneE164.trim(),
         endpointPurpose: purpose,
         displayName: displayName.trim() || undefined,
         migrationReason: "provider_swap",
       }}
       onMigrated={() => {
         qc.invalidateQueries({ queryKey: ["meta-additional-endpoints", organizationId] });
         qc.invalidateQueries({ queryKey: ["organization-integrations"] });
         setExistingInfo(null);
         reset();
         onOpenChange(false);
       }}
     />
   )}
   ```
   `systemUserToken` fica omitido — a Edge reaproveita o token cifrado da integração no caminho `migrate`, mesma semântica do `mode='additional'`.

## Critério de aceite

- "Validar na Meta e adicionar" em `+551150287027` (já ocupado por endpoint Twilio):
  - Não exibe mais o toast "Falha ao adicionar: Já existe um endpoint…";
  - Mostra toast informativo "Número já existe nesta organização";
  - Abre `MigrateEndpointDialog` com `endpointId`, `provider='twilio'`, `senderSid='XE…'`;
  - Dry-run e migrate operam normalmente; ao concluir, fecha ambos os diálogos e invalida as queries.
- Demais erros mantêm os toasts atuais.
