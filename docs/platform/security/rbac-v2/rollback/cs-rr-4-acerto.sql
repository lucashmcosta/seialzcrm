-- Rollback item 4
DROP FUNCTION IF EXISTS public.cs_round_robin_enable(uuid);
DROP FUNCTION IF EXISTS public.cs_round_robin_disable(uuid);
DROP FUNCTION IF EXISTS public.cs_round_robin_preview(uuid);
DROP FUNCTION IF EXISTS public.cs_round_robin_overview(uuid);
