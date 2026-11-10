-- Rollback de 20261110120300_loss_rpcs_and_guard.sql.
BEGIN;
DROP TRIGGER IF EXISTS trg_guard_opportunity_lost_v1 ON public.opportunities;
DROP FUNCTION IF EXISTS public.fn_guard_opportunity_lost_v1();
DROP FUNCTION IF EXISTS public.loss_reason_usage_v1(uuid);
DROP FUNCTION IF EXISTS public.list_loss_reason_options_v1(uuid);
DROP FUNCTION IF EXISTS public.correct_opportunity_loss_v1(uuid, uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.reopen_opportunity_v1(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.mark_opportunities_lost_batch_v1(uuid, uuid[], uuid, uuid, text, date, text);
DROP FUNCTION IF EXISTS public.mark_opportunity_lost_v1(uuid, uuid, uuid, uuid, text, date, text);
DROP FUNCTION IF EXISTS public.fn_mark_opportunity_lost_internal_v1(uuid, uuid, uuid, uuid, text, date, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.fn_resolve_loss_choice_v1(uuid, uuid, uuid, text, boolean);
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('public.rbac_full_perms()'::regprocedure);
  n := replace(d, ',"corrigir_motivo_perda":true}', '}');
  IF n <> d THEN EXECUTE n; END IF;
END $$;
COMMIT;
