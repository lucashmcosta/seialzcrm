-- Rollback de 20261110120100_loss_settings.sql.
BEGIN;
DROP FUNCTION IF EXISTS public.loss_settings_internal_v1(uuid);
DROP TABLE IF EXISTS public.opportunity_loss_settings;
COMMIT;
