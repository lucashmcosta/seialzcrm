ALTER TABLE public.registry_backfill_jobs
  ADD COLUMN IF NOT EXISTS exact_name_items integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_merged_name_items integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filled_empty_name_items integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.registry_backfill_jobs.exact_name_items IS
  'CPFs cujo nome retornado já coincidia com o contato após normalização.';
COMMENT ON COLUMN public.registry_backfill_jobs.auto_merged_name_items IS
  'Nomes substituídos automaticamente após correspondência conservadora.';
COMMENT ON COLUMN public.registry_backfill_jobs.filled_empty_name_items IS
  'Contatos sem nome preenchidos a partir do provedor de CPF.';
