

# API & Webhooks: Endpoints Customizaveis com Field Mapping e Permissoes Granulares

## O que voce vai ganhar

1. **Permissoes granulares por API Key** -- ao criar uma key, escolher exatamente o que ela pode fazer (ler contatos, criar oportunidades, etc.)
2. **Field Mapping visual** -- mapear campos que o sistema externo envia para os campos internos do CRM (ex: o sistema de assinatura envia `signerName` e voce mapeia para `full_name`)
3. **Endpoints de recepcao** -- criar endpoints dedicados para receber dados de sistemas externos (assinatura de contrato, formularios, ERPs, etc.)
4. **Documentacao dinamica** -- os exemplos de uso atualizam automaticamente conforme as permissoes e mapeamentos configurados

## Como vai funcionar na pratica

Exemplo: sistema de assinatura de contrato faz um POST:

```text
O sistema externo envia:              O CRM recebe e traduz:
{                                     
  "signerName": "Joao Silva",    -->  full_name: "Joao Silva"
  "signerEmail": "joao@x.com",  -->  email: "joao@x.com"  
  "contractValue": 5000,        -->  opportunity_value: 5000
  "status": "signed"            -->  notes: "Status: signed"
}
```

## Secoes Tecnicas

### 1. Nova tabela: `webhook_field_mappings`

Armazena os mapeamentos de campos por organizacao, direcao e entidade.

```sql
CREATE TABLE webhook_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  entity_type TEXT NOT NULL DEFAULT 'contact' CHECK (entity_type IN ('contact', 'opportunity', 'activity')),
  external_field TEXT NOT NULL,
  internal_field TEXT NOT NULL,
  is_required BOOLEAN DEFAULT false,
  default_value TEXT,
  transform_type TEXT DEFAULT 'direct' CHECK (transform_type IN ('direct', 'phone_e164', 'lowercase', 'uppercase')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, direction, entity_type, external_field)
);
-- RLS com funcao existente user_has_org_access
```

### 2. Novos escopos de API Key

| Escopo | Descricao |
|--------|-----------|
| `leads:write` | Mantido para retrocompatibilidade |
| `contacts:read` | Ler contatos via GET |
| `contacts:write` | Criar/atualizar contatos via POST |
| `opportunities:read` | Ler oportunidades via GET |
| `opportunities:write` | Criar oportunidades via POST |
| `activities:read` | Ler atividades via GET |
| `activities:write` | Criar notas/atividades via POST |

### 3. Mudancas na UI (`ApiWebhooksSettings.tsx`)

**Nova secao "Field Mapping"** (abaixo das API Keys):
- Select de entidade: Contato, Oportunidade
- Tabela editavel com colunas: Campo Externo | Campo Interno (select) | Obrigatorio | Transformacao
- Botao "Adicionar mapeamento"
- Campos internos pre-populados como opcoes de select:
  - Contato: full_name, email, phone, company_name, source, utm_source, utm_medium, utm_campaign
  - Oportunidade: title, amount, source

**Dialog de criacao de API Key atualizado**:
- Escopos agrupados por entidade com checkboxes Read/Write
- Compatibilidade: `leads:write` continua funcionando como alias de `contacts:write`

**Documentacao dinamica**:
- Exemplos de POST mostram os campos mapeados (se configurados)
- Se tem escopos de leitura, mostra exemplo de GET

### 4. Mudancas na edge function `lead-webhook/index.ts`

- **GET**: retorna dados baseado nos escopos (contacts:read, opportunities:read)
- **POST com field mapping**: busca `webhook_field_mappings` da org, traduz payload externo para campos internos
- **Transformacoes**: `phone_e164` normaliza telefone, `lowercase` para emails, `direct` copia valor
- **Escopos granulares**: checa `contacts:write` ou `leads:write` (retrocompativel)
- Se nao houver mapeamento configurado, usa campos padrao atuais (100% retrocompativel)

### 5. Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| Nova migracao SQL | Tabela `webhook_field_mappings` com RLS |
| `src/components/settings/ApiWebhooksSettings.tsx` | Secao Field Mapping, escopos granulares, docs dinamica |
| `supabase/functions/lead-webhook/index.ts` | GET, field mapping, escopos granulares, transformacoes |

