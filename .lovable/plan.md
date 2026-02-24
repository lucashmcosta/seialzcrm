
# Receber Documento Assinado do SuvSign (Webhook)

## Resumo

Criar uma edge function dedicada `suvsign-webhook` para receber o webhook `document.completed` do SuvSign. Ao receber, a funcao vai:

1. Validar a assinatura HMAC-SHA256 (seguranca)
2. Localizar a oportunidade pelo `deal_id` do metadata
3. Baixar o PDF assinado e salvar no Storage do Supabase
4. Criar um registro na tabela `attachments` vinculado a oportunidade
5. Registrar uma atividade no timeline da oportunidade
6. Retornar 200 para confirmar recebimento

Alem disso, atualizar o `SendToSignatureButton` para enviar `contact_id` no payload, permitindo que o webhook saiba qual contato esta associado.

---

## Mudancas

### 1. Atualizar `SendToSignatureButton.tsx` - Enviar `contact_id` no payload

Adicionar `contact_id` ao objeto `custom` do payload enviado ao SuvSign, para que ele retorne via webhook metadata.

```typescript
// Adicionar junto com os outros campos custom:
payload.custom.contact_id = contactId;
```

### 2. Criar Edge Function `suvsign-webhook`

**Arquivo:** `supabase/functions/suvsign-webhook/index.ts`

Fluxo da funcao:

```text
POST /suvsign-webhook
  |
  +-- Validar X-Webhook-Signature (HMAC-SHA256) usando secret da org
  |
  +-- Extrair deal_id e contact_id do payload metadata
  |
  +-- Buscar a oportunidade pelo deal_id
  |     (para obter organization_id e confirmar existencia)
  |
  +-- Baixar o PDF de data.document.file_url
  |
  +-- Upload do PDF no bucket "attachments"
  |     path: {opportunity_id}/{timestamp}_signed.pdf
  |
  +-- Inserir registro na tabela "attachments"
  |     entity_type: "opportunity"
  |     entity_id: opportunity_id
  |
  +-- Inserir atividade no timeline
  |     activity_type: "system"
  |     title: "Documento assinado: {titulo}"
  |
  +-- Retornar 200 OK
```

**Autenticacao do webhook:** O SuvSign envia um header `X-Webhook-Signature` com HMAC-SHA256 do body. O secret precisa ser armazenado como um Supabase secret (`SUVSIGN_WEBHOOK_SECRET`).

**Alternativa simplificada:** Como cada organizacao pode ter um secret diferente no SuvSign, podemos armazenar o webhook_secret no `config_values` da `organization_integrations`. A funcao buscara o secret da org pelo `connector_id` do metadata.

### 3. Adicionar campo `webhook_secret` ao config_schema do SuvSign

Atualizar o `config_schema` na tabela `admin_integrations` para incluir um campo `webhook_secret`:

```json
{
  "key": "webhook_secret",
  "label": "Webhook Secret",
  "type": "password",
  "placeholder": "Secret para validacao HMAC",
  "required": false,
  "description": "Encontre no SuvSign em Configuracoes > Webhooks. Usado para validar assinatura dos webhooks recebidos."
}
```

### 4. Atualizar `config.toml`

```toml
[functions.suvsign-webhook]
verify_jwt = false
```

---

## Detalhes Tecnicos

### Edge Function: `suvsign-webhook/index.ts`

```text
Payload recebido (POST body):
{
  "event": "document.completed",
  "document_id": "uuid",
  "timestamp": "2026-02-24T15:30:00Z",
  "data": {
    "document": {
      "id": "uuid",
      "title": "Nome do Contrato",
      "status": "completed",
      "completed_at": "2026-02-24T15:30:00Z",
      "file_url": "https://...supabase.co/storage/.../doc.pdf"
    },
    "signatories": [...],
    "metadata": {
      "deal_id": "uuid-da-oportunidade",
      "contact_id": "uuid-do-contato",
      "connector_id": "uuid-do-connector"
    }
  }
}
```

**Fluxo de validacao HMAC:**
1. Ler `connector_id` do metadata
2. Buscar `organization_integrations` pelo `connector_id` no `config_values`
3. Extrair `webhook_secret` do `config_values`
4. Se webhook_secret existir, validar HMAC-SHA256 do body contra `X-Webhook-Signature`
5. Se nao existir, aceitar sem validacao (campo opcional)

**Busca da oportunidade:**
- Buscar em `opportunities` pelo `id = deal_id`
- Usar o `organization_id` da oportunidade para as insercoes seguintes
- Se nao encontrar, retornar 404

**Download e upload do PDF:**
- Fazer `fetch(data.document.file_url)` para baixar o PDF
- Upload no bucket `attachments` com path `{opportunity_id}/{timestamp}_signed.pdf`
- Registrar na tabela `attachments` com `entity_type: 'opportunity'`

**Atividade no timeline:**
- Inserir em `activities` com `activity_type: 'system'`
- Titulo: `Documento assinado: {document.title}`
- Body: `Assinado em {completed_at} por {lista de signatarios}`
- Vinculado a `opportunity_id` e `contact_id`

### URL do Webhook para configurar no SuvSign

A URL que o usuario deve cadastrar no SuvSign:

```text
https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/suvsign-webhook
```

Nao requer autenticacao (JWT desabilitado), a seguranca e feita via HMAC.

### Tabelas utilizadas (sem alteracoes de schema)

- `organization_integrations` - buscar config do SuvSign (webhook_secret)
- `opportunities` - localizar o negocio pelo deal_id
- `attachments` - salvar referencia do PDF (entity_type: 'opportunity')
- `activities` - registrar evento no timeline (activity_type: 'system')
- Storage bucket `attachments` - armazenar o PDF

### Secret necessario

Nenhum secret global do Supabase e necessario. O webhook_secret e armazenado por organizacao no `config_values` da integracao.
