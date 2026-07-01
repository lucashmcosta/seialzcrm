REVOKE EXECUTE ON FUNCTION public.rpc_inbox_queue_counts(uuid, boolean, uuid, timestamp with time zone, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.rpc_list_inbox_threads(uuid, text, boolean, uuid, timestamp with time zone, boolean, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.rpc_inbox_queue_counts(uuid, boolean, uuid, timestamp with time zone, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_list_inbox_threads(uuid, text, boolean, uuid, timestamp with time zone, boolean, integer) TO authenticated;