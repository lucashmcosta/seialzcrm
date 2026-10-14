-- Rollback: Widget Workspace V2 (2026-10-14)
-- Remove somente a tabela de layout pessoal. Config por org e pins (V1) intactos.
BEGIN;
DROP TABLE IF EXISTS public.user_widget_workspace;
COMMIT;
