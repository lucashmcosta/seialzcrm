DROP FUNCTION IF EXISTS public.rpc_list_message_threads(uuid, text, text[], uuid, boolean, timestamp with time zone, uuid, integer);
DROP FUNCTION IF EXISTS public.rpc_list_message_threads(uuid, text, text[], uuid, boolean, timestamp with time zone, uuid, integer, text);

REVOKE ALL ON FUNCTION public.rpc_list_message_threads(uuid, text, text[], uuid, boolean, timestamp with time zone, uuid, integer, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_list_message_threads(uuid, text, text[], uuid, boolean, timestamp with time zone, uuid, integer, text, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_message_threads(uuid, text, text[], uuid, boolean, timestamp with time zone, uuid, integer, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_list_message_threads(uuid, text, text[], uuid, boolean, timestamp with time zone, uuid, integer, text, uuid[]) TO service_role;