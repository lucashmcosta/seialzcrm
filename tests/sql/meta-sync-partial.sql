\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE public.meta_sync_runs (
  id integer PRIMARY KEY,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  completed_at timestamptz
);
INSERT INTO public.meta_sync_runs (id) VALUES (1);
\ir ../../supabase/migrations/20261019190006_meta_sync_partial_status.sql
UPDATE public.meta_sync_runs SET status='partial', completed_at=now() WHERE id=1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.meta_sync_runs WHERE id=1 AND status='partial' AND completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'partial invocation was not recorded';
  END IF;
  BEGIN
    UPDATE public.meta_sync_runs SET status='invalid' WHERE id=1;
    RAISE EXCEPTION 'invalid state was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
