-- Rollback de 20261018170000_process_classification_certification.sql.
-- ATENÇÃO: apaga as certificações. Comissões ajustadas por certificação continuam como estão (são histórico);
-- antes de rodar em produção, exporte process_classification_certifications.
BEGIN;
DROP FUNCTION IF EXISTS public.pc_record_certification(uuid, uuid, text, uuid, text, text, jsonb, text[], jsonb, text, boolean);
DROP TABLE IF EXISTS public.process_classification_certification_results;
DROP TABLE IF EXISTS public.process_classification_certifications;
ALTER TABLE public.opportunity_commissions DROP COLUMN IF EXISTS note;
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('public.rbac_full_perms()'::regprocedure);
  n := replace(d, ',"certificar_classificacao":true}', '}');
  EXECUTE n;
END $$;
COMMIT;
