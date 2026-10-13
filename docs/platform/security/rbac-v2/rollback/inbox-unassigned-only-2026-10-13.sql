-- Rollback: volta rpc_list_inbox_threads para a assinatura de 7 argumentos.
BEGIN;
DROP FUNCTION public.rpc_list_inbox_threads(uuid, text, boolean, uuid, timestamptz, boolean, integer, boolean);
-- Recriar com o corpo anterior (idêntico ao novo, sem p_unassigned_only e sem a linha
-- "AND (NOT p_unassigned_only OR t.assigned_user_id IS NULL)").
-- Grants originais: EXECUTE para authenticated e service_role (anon revogado).
REVOKE ALL ON FUNCTION public.rpc_list_inbox_threads(uuid, text, boolean, uuid, timestamptz, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_inbox_threads(uuid, text, boolean, uuid, timestamptz, boolean, integer) TO authenticated, service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
