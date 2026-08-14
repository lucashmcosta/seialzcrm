-- 1. feature_flags (UI): escopo global
UPDATE public.feature_flags
   SET is_enabled = true,
       organization_ids = '{}'::uuid[]
 WHERE name = 'evolution_api_enabled';

-- 2. integration_feature_flags (backend): linha GLOBAL habilitada
UPDATE public.integration_feature_flags
   SET enabled = true
 WHERE flag_key = 'evolution_api_enabled'
   AND organization_id IS NULL;

INSERT INTO public.integration_feature_flags (flag_key, organization_id, enabled)
SELECT 'evolution_api_enabled', NULL, true
 WHERE NOT EXISTS (
   SELECT 1 FROM public.integration_feature_flags
    WHERE flag_key = 'evolution_api_enabled' AND organization_id IS NULL
 );