-- Rollback item 1 (Rodízio do Atendimento — estrutura)
DROP FUNCTION IF EXISTS public.can_receive_cs(uuid, uuid);
DROP FUNCTION IF EXISTS public.perms_v2_for_user(uuid, uuid);
DROP TABLE IF EXISTS public.cs_routing_errors;
DROP TABLE IF EXISTS public.cs_round_robin_members;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS cs_round_robin_enabled;
