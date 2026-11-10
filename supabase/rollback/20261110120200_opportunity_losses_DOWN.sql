-- Rollback de 20261110120200_opportunity_losses.sql. Apaga o histórico de perdas gravado desde a entrega.
BEGIN;
DROP TRIGGER IF EXISTS trg_close_open_loss_on_reopen_v1 ON public.opportunities;
DROP FUNCTION IF EXISTS public.fn_close_open_loss_on_reopen_v1();
DROP TRIGGER IF EXISTS trg_guard_loss_reason_usage ON public.opportunity_loss_reasons;
DROP TRIGGER IF EXISTS trg_guard_loss_detail_usage ON public.opportunity_loss_reason_details;
DROP FUNCTION IF EXISTS public.fn_guard_loss_reason_usage();
DROP FUNCTION IF EXISTS public.fn_guard_loss_detail_usage();
DROP TABLE IF EXISTS public.opportunity_loss_corrections;
DROP TABLE IF EXISTS public.opportunity_losses;
DROP FUNCTION IF EXISTS public.loss_reason_is_used(uuid);
DROP FUNCTION IF EXISTS public.loss_detail_is_used(uuid);
COMMIT;
