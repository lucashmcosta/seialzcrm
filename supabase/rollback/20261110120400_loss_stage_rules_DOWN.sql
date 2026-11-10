-- Rollback de 20261110120400_loss_stage_rules.sql.
BEGIN;
DROP FUNCTION IF EXISTS public.list_loss_stage_rule_issues_v1(uuid);
DROP FUNCTION IF EXISTS public.loss_stage_rule_detail_v1(uuid);
DROP TABLE IF EXISTS public.opportunity_loss_stage_rules;
DROP FUNCTION IF EXISTS public.fn_validate_loss_stage_rule_v1();
COMMIT;
