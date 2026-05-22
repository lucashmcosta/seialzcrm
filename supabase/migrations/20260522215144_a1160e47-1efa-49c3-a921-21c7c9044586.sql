UPDATE organization_integrations
SET config_values = COALESCE(config_values, '{}'::jsonb)
  || jsonb_build_object('feature_ads_manager_sync', true),
  connected_account = COALESCE(connected_account, '{}'::jsonb)
    || jsonb_build_object(
      'ad_account_id', 'act_1145377357130771',
      'ad_account_name', 'Viagi',
      'business_id', NULL
    ),
  updated_at = now()
WHERE id = 'e88cb37b-33c9-4802-a3d0-f99d611753f8';