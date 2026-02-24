UPDATE admin_integrations SET config_schema = jsonb_set(
  config_schema,
  '{fields}',
  (config_schema->'fields') || '[{"key":"webhook_secret","label":"Webhook Secret","type":"password","placeholder":"Secret para validação HMAC","required":false,"description":"Encontre no SuvSign em Configurações > Webhooks. Usado para validar assinatura dos webhooks recebidos."}]'::jsonb
) WHERE slug = 'suvsign';