-- Rollback de 20261019180000_process_classification_dashboard.sql (só função de leitura).
BEGIN;
DROP FUNCTION IF EXISTS public.pc_dashboard_commissions(uuid, date, date, uuid);
COMMIT;
