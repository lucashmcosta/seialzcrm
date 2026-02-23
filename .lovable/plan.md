

# Integracao SuvSign (Assinatura Eletronica) com o CRM

## Visao Geral

A integracao com o SuvSign funciona em dois sentidos:
- **CRM para SuvSign**: Redirect do usuario com dados do contato/oportunidade na URL
- **SuvSign para CRM**: Webhook POST quando o documento e assinado

O sistema de webhook de recepcao (lead-webhook + field mapping) ja existe e cobre o passo 2. Precisamos criar o passo 1 e registrar o SuvSign como integracao.

## O que sera feito

### 1. Registrar SuvSign como integracao no catalogo

Inserir na tabela `admin_integrations` com:
- slug: `suvsign`
- categoria: `automation` (ou nova categoria `documents`)
- config_schema com campos: `base_url` (default: https://suvsign.com), `template_id`, `connector_id`
- status: `available`

Migracao SQL para inserir o registro.

### 2. Botao "Enviar para Assinatura" na tela de Oportunidade e Contato

Adicionar um componente `SendToSignatureButton` que:
- Aparece na tela de detalhe do contato e da oportunidade
- So aparece se a organizacao tem a integracao SuvSign ativa
- Ao clicar, monta a URL do SuvSign com os dados do contato/oportunidade como JSON no parametro `?data=`
- Abre em nova aba (`window.open`)

Dados enviados na URL:
```text
https://suvsign.com/create-from-template
  ?template_id={configurado na integracao}
  &connector_id={configurado na integracao}
  &data={"client":{"firstName":"Joao","email":"joao@email.com"},"custom":{"ValorContrato":"R$ 5.000"}}
```

### 3. Webhook de retorno (ja funcional)

O webhook de retorno do SuvSign ja pode ser recebido pelo endpoint `lead-webhook` existente. Basta o usuario:
1. Configurar uma API Key com escopo `contacts:write`
2. Configurar field mappings para traduzir os campos do SuvSign (ex: `metadata.deal_id` para `notes`)
3. Colocar a URL do webhook + API Key nas configuracoes do SuvSign

Nao precisa de mudanca no backend para isso.

### 4. Documentacao da integracao

Adicionar instrucoes na secao de documentacao dinamica do ApiWebhooksSettings mostrando como configurar o webhook de retorno do SuvSign.

## Secao Tecnica

### Migracao SQL

```sql
INSERT INTO admin_integrations (name, slug, description, category, status, sort_order, config_schema)
VALUES (
  'SuvSign',
  'suvsign',
  'Assinatura eletronica de documentos. Envie contratos para assinatura diretamente do CRM.',
  'automation',
  'available',
  50,
  '{
    "fields": [
      {
        "key": "base_url",
        "label": "URL do SuvSign",
        "type": "text",
        "placeholder": "https://suvsign.com",
        "required": true,
        "description": "URL base da sua instancia SuvSign"
      },
      {
        "key": "template_id",
        "label": "ID do Template",
        "type": "text",
        "placeholder": "ID do template de documento",
        "required": true,
        "description": "Encontre no SuvSign em Templates > Ver Codigo"
      },
      {
        "key": "connector_id",
        "label": "ID do Conector",
        "type": "text",
        "placeholder": "ID do conector configurado",
        "required": true,
        "description": "Encontre no SuvSign em Conectores > Ver Codigo"
      }
    ]
  }'
);
```

### Novo componente: `src/components/signature/SendToSignatureButton.tsx`

- Recebe `contactId` e opcionalmente `opportunityId`
- Busca dados do contato (nome, email, telefone) e da oportunidade (titulo, valor)
- Busca config da integracao SuvSign da organizacao
- Monta a URL com `template_id`, `connector_id` e `data` (JSON encode)
- Renderiza um botao com icone de caneta/assinatura

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| Nova migracao SQL | Inserir SuvSign no catalogo de integracoes |
| `src/components/signature/SendToSignatureButton.tsx` | Novo componente do botao de assinatura |
| `src/pages/contacts/ContactDetail.tsx` | Adicionar botao SendToSignature no header |
| `src/pages/opportunities/OpportunityDetail.tsx` | Adicionar botao SendToSignature no header |
| `src/components/settings/IntegrationsSettings.tsx` | Adicionar icone `suvsign` no iconMap |

