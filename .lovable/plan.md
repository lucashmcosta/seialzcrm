
# Fix: Executar a migração que corrige os modelos Claude no banco de dados

## O que está errado

A edge function foi corrigida (fallback agora é `claude-3-5-sonnet-20241022`), mas a migração do banco **nunca foi executada**. O banco ainda tem:

```json
{
  "default": "claude-sonnet-4-20250514",
  "options": ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", ...]
}
```

Isso causa dois problemas:
1. A UI de integração mostra `claude-sonnet-4-20250514` como modelo selecionado (inválido)
2. Quando o usuário reconecta a integração, salva `claude-sonnet-4-20250514` no `config_values` — quebrando tudo novamente
3. As organizações sem `default_model` no `config_values` usam o fallback do código (corrigido), mas o `config_schema` ainda mostra o modelo inválido como padrão

## Mudanças necessárias

### 1. Migração SQL — corrigir `config_schema` no banco

Atualizar o campo `default_model` no `config_schema` da integração `claude-ai` com:
- Valor padrão correto: `claude-3-5-sonnet-20241022`
- Opções válidas incluindo os modelos 3.5, 3.7, Sonnet 4.5 e Opus 4

```sql
UPDATE admin_integrations
SET config_schema = jsonb_set(
  config_schema,
  '{fields,1}',
  '{
    "key": "default_model",
    "label": "Modelo Padrão",
    "type": "select",
    "required": true,
    "default": "claude-3-5-sonnet-20241022",
    "description": "Modelo a ser usado nas requisições",
    "options": [
      "claude-3-5-haiku-20241022",
      "claude-3-5-sonnet-20241022",
      "claude-3-7-sonnet-20250219",
      "claude-sonnet-4-5",
      "claude-opus-4-5"
    ]
  }'::jsonb
)
WHERE slug = 'claude-ai';
```

### 2. Corrigir `config_values` das organizações existentes que têm modelo inválido salvo

As organizações que já conectaram e salvaram `default_model: "claude-sonnet-4-20250514"` precisam ser corrigidas:

```sql
UPDATE organization_integrations
SET config_values = config_values - 'default_model' || '{"default_model": "claude-3-5-sonnet-20241022"}'::jsonb
WHERE integration_id = (SELECT id FROM admin_integrations WHERE slug = 'claude-ai')
AND config_values->>'default_model' = 'claude-sonnet-4-20250514';
```

### 3. Resultado esperado

Após a migração:
- A UI vai mostrar as opções corretas (3.5 Haiku, 3.5 Sonnet, 3.7 Sonnet, Sonnet 4.5, Opus 4)
- O modelo padrão será `claude-3-5-sonnet-20241022` (válido)
- Organizações com modelo inválido salvo serão corrigidas automaticamente
- Nenhuma reconexão necessária pelo usuário

## Arquivos afetados

| Recurso | Mudança |
|---------|---------|
| `admin_integrations` (banco) | Atualizar `config_schema` com modelos válidos |
| `organization_integrations` (banco) | Corrigir `default_model` inválido nas orgs existentes |

Nenhuma mudança em arquivos de código — apenas dados no banco.
