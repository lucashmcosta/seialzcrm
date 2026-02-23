INSERT INTO admin_integrations (name, slug, description, category, status, sort_order, config_schema)
VALUES (
  'SuvSign',
  'suvsign',
  'Assinatura eletrônica de documentos. Envie contratos para assinatura diretamente do CRM.',
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
        "description": "URL base da sua instância SuvSign"
      },
      {
        "key": "template_id",
        "label": "ID do Template",
        "type": "text",
        "placeholder": "ID do template de documento",
        "required": true,
        "description": "Encontre no SuvSign em Templates > Ver Código"
      },
      {
        "key": "connector_id",
        "label": "ID do Conector",
        "type": "text",
        "placeholder": "ID do conector configurado",
        "required": true,
        "description": "Encontre no SuvSign em Conectores > Ver Código"
      }
    ]
  }'::jsonb
);