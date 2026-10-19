-- Rollback de 20261019190000_opportunity_reopen_control.sql.
BEGIN;
DROP TRIGGER IF EXISTS trg_guard_opportunity_reopen_v1 ON public.opportunities;
DROP FUNCTION IF EXISTS public.fn_guard_opportunity_reopen_v1();
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('public.rbac_full_perms()'::regprocedure);
  n := replace(d, ',"reabrir_oportunidade":true}', '}');
  IF n <> d THEN EXECUTE n; END IF;
END $$;
ALTER TABLE public.opportunity_close_policies DROP COLUMN IF EXISTS control_reopen;
COMMIT;
