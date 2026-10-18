-- Rollback de 20261018190000_process_classification_calibration.sql (só funções; versões publicadas ficam).
BEGIN;
DROP FUNCTION IF EXISTS public.pc_save_draft(uuid, jsonb, uuid, timestamptz, text);
DROP FUNCTION IF EXISTS public.pc_discard_draft(uuid);
DROP FUNCTION IF EXISTS public.pc_publish_calibration(uuid, uuid, text, timestamptz);
COMMIT;
