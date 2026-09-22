REVOKE EXECUTE ON FUNCTION public.fn_push_unread_thread_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_mark_thread_read(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_register_push_token_v2(text, text, text, boolean) FROM anon;