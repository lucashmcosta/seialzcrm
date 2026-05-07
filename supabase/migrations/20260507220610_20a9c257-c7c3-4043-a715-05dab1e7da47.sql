UPDATE public.admin_integrations
SET config_schema = '{
  "fields": [
    {"key":"system_user_token","label":"System User Token","type":"password","required":true,"help":"Token gerado em Business Manager → System Users → Generate Token"},
    {"key":"business_id","label":"Business ID (opcional)","type":"text","required":false},
    {"key":"app_id","label":"App ID (avançado)","type":"text","required":false,"help":"Só preencha se o app exigir appsecret_proof"},
    {"key":"app_secret","label":"App Secret (avançado)","type":"password","required":false}
  ]
}'::jsonb
WHERE slug = 'meta-lead-ads';