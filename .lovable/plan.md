

## Plano: Configurações de Entrada para WhatsApp (Inbound Settings)

### Problema
O webhook de WhatsApp (`twilio-whatsapp-webhook`) **sempre** cria contatos automaticamente quando recebe mensagens de números desconhecidos. Não existe controle para:
- Criar ou não contato automaticamente
- Criar ou não oportunidade automaticamente
- Definir pipeline/estágio padrão para oportunidades criadas
- Definir lifecycle stage do contato

O webhook de voz (`twilio-webhook`) já tem esse controle via `inbound_settings` na tabela `phone_numbers`, mas o WhatsApp não usa essa tabela.

### Solução
Adicionar um campo `whatsapp_inbound_settings` (JSONB) na tabela `organization_integrations` e criar uma UI de configuração na seção de integrações/WhatsApp.

### Estrutura do JSON

```json
{
  "auto_create_contact": true,
  "default_lifecycle_stage": "lead",
  "auto_create_opportunity": false,
  "default_pipeline_id": null,
  "default_stage_id": null,
  "default_opportunity_owner": "contact_owner"
}
```

### Arquivos a criar/editar

| Arquivo | Ação |
|---------|------|
| Migration SQL | Adicionar coluna `whatsapp_inbound_settings` em `organization_integrations` |
| `src/components/settings/WhatsAppInboundSettings.tsx` | Criar - UI com switches e selects para configurar as regras |
| `src/components/settings/IntegrationDetailDialog.tsx` | Editar - Incluir a seção de inbound settings no dialog do WhatsApp |
| `supabase/functions/twilio-whatsapp-webhook/index.ts` | Editar - Consultar `whatsapp_inbound_settings` antes de criar contato/oportunidade |

### Detalhes técnicos

1. **Migration**: `ALTER TABLE organization_integrations ADD COLUMN whatsapp_inbound_settings jsonb DEFAULT '{"auto_create_contact": true, "default_lifecycle_stage": "lead", "auto_create_opportunity": false}'`

2. **UI**: Novo componente com:
   - Switch "Criar contato automaticamente" (default: on)
   - Select "Estágio do ciclo de vida" (lead, subscriber, opportunity, customer)
   - Switch "Criar oportunidade automaticamente" (default: off)
   - Se oportunidade ativada: Select de pipeline e estágio

3. **Webhook**: No trecho onde hoje faz auto-create (linha ~343), buscar as settings da `organization_integrations` e respeitar as configurações. Se `auto_create_contact = false`, não criar e retornar OK silenciosamente.

