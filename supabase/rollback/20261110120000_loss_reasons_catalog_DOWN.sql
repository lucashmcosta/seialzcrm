-- Rollback de 20261110120000_loss_reasons_catalog.sql (rodar depois dos rollbacks 120400 → 120100).
BEGIN;
DROP TABLE IF EXISTS public.opportunity_loss_reason_details;
DROP TABLE IF EXISTS public.opportunity_loss_reasons;
DROP FUNCTION IF EXISTS public.fn_guard_loss_detail_reason();
DROP FUNCTION IF EXISTS public.fn_guard_loss_reason_org();
DROP FUNCTION IF EXISTS public.fn_touch_loss_catalog();
DROP FUNCTION IF EXISTS public.can_manage_loss_reasons(uuid);
COMMIT;
