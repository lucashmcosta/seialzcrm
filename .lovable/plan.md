
# Fix: Corrigir modelos Claude com IDs reais da API Anthropic (Feb 2026)

## O problema agora

O dropdown mostra:
- `claude-sonnet-4-20250514` — **NÃO EXISTE** na API
- `claude-3-opus-20240229` — modelo antigo (Claude 3, não Claude 4)

O banco (`admin_integrations.config_schema`) NUNCA foi atualizado com os IDs corretos. A migração SQL dos planos anteriores nunca foi executada — por isso os modelos errados continuam aparecendo.

## IDs corretos da API Anthropic (confirmados na screenshot do docs)

| Nome | API ID | Descrição |
|------|--------|-----------|
| Claude Haiku 4.5 | `claude-haiku-4-5` | Mais rápido, $1/MTok |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Melhor custo-benefício, $3/MTok |
| Claude Opus 4.6 | `claude-opus-4-6` | Mais inteligente, $5/MTok |
| Claude 3.5 Sonnet | `claude-3-5-sonnet-20241022` | Legado, ainda válido |
| Claude 3.5 Haiku | `claude-3-5-haiku-20241022` | Legado, rápido |
| Claude 3.7 Sonnet | `claude-3-7-sonnet-20250219` | Legado, raciocínio |

## Mudanças necessárias

### 1. Migration SQL — `admin_integrations` (arquivo novo em `supabase/migrations/`)

Criar arquivo de migração que executa o UPDATE no banco com os modelos corretos:

```sql
UPDATE admin_integrations
SET config_schema = '{
  "fields": [
    {
      "key": "api_key",
      "label": "API Key",
      "type": "password",
      "required": true,
      "placeholder": "sk-ant-api03-...",
      "description": "Encontre sua API key em console.anthropic.com"
    },
    {
      "key": "default_model",
      "label": "Modelo Padrão",
      "type": "select",
      "required": true,
      "default": "claude-sonnet-4-6",
      "description": "Modelo a ser usado nas requisições",
      "options": [
        "claude-haiku-4-5",
        "claude-sonnet-4-6",
        "claude-opus-4-6",
        "claude-3-5-haiku-20241022",
        "claude-3-5-sonnet-20241022",
        "claude-3-7-sonnet-20250219"
      ]
    },
    {
      "key": "max_tokens",
      "label": "Max Tokens",
      "type": "number",
      "required": false,
      "default": 1024,
      "description": "Limite máximo de tokens por resposta"
    }
  ]
}'::jsonb
WHERE slug = 'claude-ai';

-- Corrigir organizações que têm modelos inválidos salvos
UPDATE organization_integrations
SET config_values = config_values - 'default_model' || '{"default_model": "claude-sonnet-4-6"}'::jsonb
WHERE integration_id = (SELECT id FROM admin_integrations WHERE slug = 'claude-ai')
AND (
  config_values->>'default_model' = 'claude-sonnet-4-20250514'
  OR config_values->>'default_model' = 'claude-3-opus-20240229'
  OR config_values->>'default_model' IS NULL
  OR config_values->>'default_model' = ''
);
```

### 2. `supabase/functions/ai-generate/index.ts` — Atualizar fallback

Linha 214 atualmente tem:
```typescript
const model = configValues.default_model || "claude-3-5-sonnet-20241022";
```

Atualizar para o modelo mais recente e válido:
```typescript
const model = configValues.default_model || "claude-sonnet-4-6";
```

## Resultado esperado

Após as mudanças:
- Dropdown mostrará: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6` (+ 3 legados)
- Default será `claude-sonnet-4-6` (válido e recomendado)
- Organizações com modelo inválido salvo serão corrigidas automaticamente
- Edge function usará `claude-sonnet-4-6` como fallback

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `supabase/migrations/[timestamp]_fix_claude_models.sql` | Novo — corrige config_schema e org configs |
| `supabase/functions/ai-generate/index.ts` | Atualiza fallback para `claude-sonnet-4-6` |
