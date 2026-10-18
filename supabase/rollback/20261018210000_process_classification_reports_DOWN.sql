-- Rollback de 20261018210000_process_classification_reports.sql (só funções de leitura).
BEGIN;
DROP FUNCTION IF EXISTS public.pc_report(uuid, timestamptz, timestamptz, uuid, text, integer, boolean, text[], integer, integer);
DROP FUNCTION IF EXISTS public.pc_report_detail(uuid);
DROP FUNCTION IF EXISTS public.pc_report_export(uuid, timestamptz, timestamptz, uuid, text, integer, boolean, text[]);
COMMIT;
