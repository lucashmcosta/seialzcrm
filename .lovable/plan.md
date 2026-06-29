## MVP: Criação/Submissão de Templates Meta Cloud API

Reutiliza tela atual de templates. Não toca em Twilio/Railway, composer, envio, dispatcher, schema, templates existentes.

**Confirmações de pré-condições:**
- Coluna `source` existe em `whatsapp_templates` → vou usar `source='meta'` direto.
- `metaWaPostJson` já existe em `_shared/meta-whatsapp/graph.ts` → reaproveitar.

### 1. Edge function nova: `meta-whatsapp-templates-create`

`supabase/functions/meta-whatsapp-templates-create/index.ts`

- Body: `{ organizationId, name, language, category, body, header?, footer?, variables?, buttons? }`.
- Resolve `organization_integrations` ativa do slug `meta-whatsapp-cloud` (mesmo padrão do sync). Lê `waba_id`, `access_token_encrypted`, `app_secret_encrypted`.
- Normaliza `language` (`pt-BR → pt_BR`) e `category` (UPPERCASE).
- Monta `components` formato Meta:
  - `HEADER` (format TEXT) se houver
  - `BODY` com `text` + `example.body_text: [[...]]` derivado das variáveis do corpo
  - `FOOTER` se houver
  - `BUTTONS` (QUICK_REPLY) se `buttons.length > 0`
- `POST /{waba_id}/message_templates` com `allow_category_change: true`.
- Sucesso → insere em `whatsapp_templates`:
  - `provider='meta_cloud_api'`, `status='pending'` (ou mapeia se Meta já voltar APPROVED/REJECTED), `twilio_content_sid=null`
  - `meta_template_name=name`, `meta_waba_id`, `organization_integration_id`, `friendly_name=name`, `language`, `category`, `template_type='text'`, `body`, `header`, `footer`, `variables`, `components`, `source='meta'`, `is_active=true`, `last_synced_at=now()`
  - `metadata.meta_cloud = { waba_id, template_id, raw }`
- Erro Meta (`MetaWaGraphError`): retorna 422 com `meta_create_failed` + mensagem amigável para duplicate.

### 2. Service + Hook frontend

- `src/services/metaWhatsAppService.ts`: adicionar `createTemplate(input)` → invoke `meta-whatsapp-templates-create`.
- `src/hooks/useWhatsAppTemplates.ts`: adicionar `useCreateMetaTemplate()` (mutation) que invalida `['whatsapp-templates']`.

### 3. Detecção de providers ativos

Novo hook `src/hooks/useActiveWhatsAppProviders.ts`:
- Query única em `organization_integrations` join `admin_integrations` para slugs `twilio-whatsapp` e `meta-whatsapp-cloud`, `is_enabled=true`.
- Retorna `{ hasTwilio, hasMeta, loading }`.

### 4. UI — `src/pages/settings/WhatsAppTemplates.tsx`

- Adicionar `provider?: string` em `WhatsAppTemplate` (em `src/services/whatsapp.ts`) para tipagem.
- Coluna "Provider" no Table com badge:
  - `meta_cloud_api` → "Meta Cloud" (verde)
  - resto → "Twilio" (azul)
- Filtro `Provider`: Todos / Twilio / Meta Cloud aplicado em `useMemo`.
- Botão "Sincronizar":
  - só Twilio: comportamento atual
  - só Meta: chama `metaWhatsAppService.syncTemplates(orgId)`
  - ambos: `DropdownMenu` "Sincronizar Twilio" / "Sincronizar Meta"
- Botão "Novo Template":
  - só Twilio: `/whatsapp/templates/new`
  - só Meta: `/whatsapp/templates/new?provider=meta_cloud_api`
  - ambos: `DropdownMenu` "Twilio" / "Meta Cloud"
- Ações por linha quando `provider === 'meta_cloud_api'`:
  - esconder "Submeter para Aprovação" (criação já submete)
  - "Editar" só quando `status !== 'approved'`
  - **esconder "Excluir"** (delete Meta fora de escopo nesta fase — sem soft delete via client)

### 5. UI — `src/pages/whatsapp/TemplateForm.tsx`

- Ler `provider` via `useSearchParams()` (default `twilio`).
- Se `provider === 'meta_cloud_api'`:
  - Forçar `templateType='text'` (manter quick-reply visível no selector se já estiver, mas no MVP focar em texto + body).
  - `<Alert>` topo: "Templates Meta são enviados para aprovação automaticamente ao criar. Após aprovação não poderão ser editados."
  - `handleSubmit` chama `useCreateMetaTemplate` em vez do hook Twilio, passando `{ organizationId, name: friendlyName, language, category, body, header, footer, variables, buttons }`.
  - Edição de template Meta `approved` redireciona para detalhe.

### 6. Validação manual

1. Org com Meta ativo: criar UTILITY pt_BR body simples → toast sucesso, linha aparece com badge "Meta Cloud" status "pending".
2. Rodar "Sincronizar Meta" → status atualiza.
3. Org com Twilio: criar template → fluxo intacto, badge "Twilio".
4. Org com ambos → dropdowns Novo/Sincronizar funcionando.
5. Excluir não aparece em templates Meta.

### Arquivos

**Novos:**
- `supabase/functions/meta-whatsapp-templates-create/index.ts`
- `src/hooks/useActiveWhatsAppProviders.ts`

**Modificados:**
- `src/services/metaWhatsAppService.ts`
- `src/services/whatsapp.ts` (adicionar `provider?: string` no tipo)
- `src/hooks/useWhatsAppTemplates.ts`
- `src/pages/settings/WhatsAppTemplates.tsx`
- `src/pages/whatsapp/TemplateForm.tsx`

Sem migration. Sem mexer em Twilio/Railway, composer, envio, dispatcher, templates existentes.