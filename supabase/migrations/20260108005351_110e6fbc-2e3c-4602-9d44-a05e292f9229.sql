-- Integração Claude (Anthropic)
INSERT INTO admin_integrations (
  name, 
  slug, 
  description, 
  category, 
  status,
  documentation_url,
  config_schema,
  sort_order
) VALUES (
  'Claude (Anthropic)',
  'claude-ai',
  'Use a IA Claude da Anthropic para gerar respostas, resumos e análises inteligentes em seu CRM.',
  'ai',
  'beta',
  'https://docs.anthropic.com/en/api/getting-started',
  '{
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
        "options": ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
        "default": "claude-sonnet-4-20250514",
        "description": "Modelo a ser usado nas requisições"
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
  }',
  10
);

-- Integração ChatGPT (OpenAI)
INSERT INTO admin_integrations (
  name, 
  slug, 
  description, 
  category, 
  status,
  documentation_url,
  config_schema,
  sort_order
) VALUES (
  'ChatGPT (OpenAI)',
  'openai-gpt',
  'Use o ChatGPT da OpenAI para assistência inteligente, geração de conteúdo e automações.',
  'ai',
  'beta',
  'https://platform.openai.com/docs/api-reference',
  '{
    "fields": [
      {
        "key": "api_key",
        "label": "API Key",
        "type": "password",
        "required": true,
        "placeholder": "sk-proj-...",
        "description": "Encontre sua API key em platform.openai.com/api-keys"
      },
      {
        "key": "organization_id",
        "label": "Organization ID (opcional)",
        "type": "text",
        "required": false,
        "placeholder": "org-...",
        "description": "ID da organização OpenAI (se aplicável)"
      },
      {
        "key": "default_model",
        "label": "Modelo Padrão",
        "type": "select",
        "required": true,
        "options": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        "default": "gpt-4o-mini",
        "description": "Modelo a ser usado nas requisições"
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
  }',
  11
);