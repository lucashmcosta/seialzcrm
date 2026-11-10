-- Rollback de 20261110130000_loss_codes_auto.sql. Os códigos já gerados continuam nas linhas.
BEGIN;
ALTER TABLE public.opportunity_loss_reasons ALTER COLUMN code DROP DEFAULT;
ALTER TABLE public.opportunity_loss_reason_details ALTER COLUMN code DROP DEFAULT;
DROP TRIGGER IF EXISTS trg_assign_loss_reason_code ON public.opportunity_loss_reasons;
DROP TRIGGER IF EXISTS trg_assign_loss_detail_code ON public.opportunity_loss_reason_details;
DROP TRIGGER IF EXISTS trg_guard_loss_reason_code_immutable ON public.opportunity_loss_reasons;
DROP TRIGGER IF EXISTS trg_guard_loss_detail_code_immutable ON public.opportunity_loss_reason_details;
DROP FUNCTION IF EXISTS public.fn_assign_loss_reason_code();
DROP FUNCTION IF EXISTS public.fn_assign_loss_detail_code();
DROP FUNCTION IF EXISTS public.fn_guard_loss_code_immutable();
DROP FUNCTION IF EXISTS public.fn_next_loss_code_seq(uuid, text);
DROP FUNCTION IF EXISTS public.loss_code_letters(integer);
DROP TABLE IF EXISTS public.opportunity_loss_code_counters;
COMMIT;
