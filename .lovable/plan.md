

# Tornar `template_id` opcional na integração SuvSign

## Resumo
Atualizar a integração SuvSign para que o campo `template_id` seja opcional. Quando não preenchido, o usuário escolherá o template diretamente na tela do SuvSign.

## Mudanças

### 1. Atualizar config_schema no banco de dados
Alterar o registro da integração SuvSign na tabela `admin_integrations` para marcar `template_id` como `required: false` e atualizar o label/description.

```text
Campo: template_id
- required: true  -->  required: false
- label: "ID do Template"  -->  "ID do Template (opcional)"
- description: atualizar para indicar que se vazio, o usuário escolhe na tela do SuvSign
```

### 2. Atualizar `SendToSignatureButton.tsx`
- Remover a validacao que exige `template_id` (linha 98: `if (!templateId || !connectorId)`)
- Manter apenas `connector_id` como obrigatorio
- Montar a URL condicionalmente:
  - Com template: `{base_url}/create-from-template?template_id={id}&connector_id={id}&data={json}`
  - Sem template: `{base_url}/create-from-template?connector_id={id}&data={json}`

### 3. Nenhuma mudanca na tela de configuracao (IntegrationConnectDialog)
O dialog de conexao ja renderiza campos dinamicamente com base no `config_schema`. Como o campo `required` sera `false`, o asterisco vermelho sumira automaticamente e o formulario permitira salvar sem preencher.

---

## Detalhes Tecnicos

### Arquivo: `src/components/signature/SendToSignatureButton.tsx`

Mudancas nas linhas 94-103:

```typescript
// ANTES:
if (!templateId || !connectorId) {
  toast.error('Configuracao do SuvSign incompleta. Verifique template_id e connector_id.');
  return;
}
const url = `${baseUrl}/create-from-template?template_id=...&connector_id=...&data=...`;

// DEPOIS:
if (!connectorId) {
  toast.error('Configuracao do SuvSign incompleta. Verifique o connector_id.');
  return;
}

const params = new URLSearchParams();
if (templateId) {
  params.set('template_id', templateId);
}
params.set('connector_id', connectorId);
params.set('data', JSON.stringify(payload));
const url = `${baseUrl}/create-from-template?${params.toString()}`;
```

### Banco de dados (UPDATE via insert tool)

```sql
UPDATE admin_integrations
SET config_schema = '{
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
      "label": "ID do Template (opcional)",
      "type": "text",
      "placeholder": "ID do template de documento",
      "required": false,
      "description": "Se vazio, o usuario escolhe o template diretamente na tela do SuvSign"
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
WHERE slug = 'suvsign';
```

## Payload enviado ao SuvSign (referencia para o projeto SuvSign)

O CRM redireciona o usuario para a URL do SuvSign com os seguintes parametros:

**URL sem template:**
```
{base_url}/create-from-template?connector_id={connector_id}&data={json_encoded}
```

**URL com template:**
```
{base_url}/create-from-template?template_id={template_id}&connector_id={connector_id}&data={json_encoded}
```

**Estrutura do payload (parametro `data`, URL-encoded JSON):**
```json
{
  "client": {
    "firstName": "Joao",
    "lastName": "Silva",
    "email": "joao@email.com",
    "phone": "+5511999999999"
  },
  "custom": {
    "cpf": "123.456.789-00",
    "rg": "12.345.678-9",
    "rg_issuer": "SSP/SP",
    "nationality": "Brasileiro",
    "address_street": "Rua Exemplo, 123",
    "address_neighborhood": "Centro",
    "address_city": "Sao Paulo",
    "address_state": "SP",
    "address_zip": "01001-000",
    "deal_id": "uuid-da-oportunidade",
    "deal_title": "Venda Apartamento",
    "deal_amount": "350000"
  }
}
```

Campos em `custom` sao enviados apenas quando preenchidos no contato/oportunidade do CRM.

