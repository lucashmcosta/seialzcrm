-- Rollback B4: restaura as expressões originais das policies salvas em _rbac_v2_policy_backup
DO $$ DECLARE b record; s text; BEGIN
  FOR b IN SELECT * FROM public._rbac_v2_policy_backup LOOP
    s := format('ALTER POLICY %I ON public.%I', b.policyname, b.tablename);
    IF b.qual IS NOT NULL THEN s := s || format(' USING (%s)', b.qual); END IF;
    IF b.with_check IS NOT NULL THEN s := s || format(' WITH CHECK (%s)', b.with_check); END IF;
    EXECUTE s;
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_rbac_v2_guard ON public.contacts;
DROP TRIGGER IF EXISTS trg_rbac_v2_guard ON public.opportunities;
DROP TRIGGER IF EXISTS trg_rbac_v2_guard ON public.tasks;
DROP TRIGGER IF EXISTS trg_rbac_v2_guard ON public.message_threads;
DROP FUNCTION IF EXISTS public.fn_rbac_v2_guard();
-- rpc_list_message_threads: reverter trechos v_rbac (ver rollback/A9.sql para a versão anterior)
-- fn_guard_soft_delete: remover a linha "IF public.rbac_v2_on(NEW.organization_id) THEN RETURN NEW; END IF;"
