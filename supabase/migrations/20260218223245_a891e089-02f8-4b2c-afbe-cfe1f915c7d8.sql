-- Fix Claude AI integration: update config_schema with correct Anthropic API model IDs
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
}'::jsonb,
updated_at = now()
WHERE slug = 'claude-ai';

-- Fix organization_integrations: set default_model for orgs that have invalid or null model saved
UPDATE organization_integrations
SET config_values = COALESCE(config_values, '{}'::jsonb) - 'default_model' || '{"default_model": "claude-sonnet-4-6"}'::jsonb,
    updated_at = now()
WHERE integration_id = (SELECT id FROM admin_integrations WHERE slug = 'claude-ai')
AND (
  config_values->>'default_model' IS NULL
  OR config_values->>'default_model' = ''
  OR config_values->>'default_model' = 'claude-sonnet-4-20250514'
  OR config_values->>'default_model' = 'claude-3-opus-20240229'
  OR config_values->>'default_model' = 'claude-sonnet-4-20250514-20250514'
);