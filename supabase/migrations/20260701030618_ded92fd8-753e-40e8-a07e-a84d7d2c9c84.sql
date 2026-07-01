-- Hardening formal de rpc_search_contacts: fecha EXECUTE default para PUBLIC
-- e concede explicitamente apenas para o role `authenticated`.
REVOKE ALL ON FUNCTION public.rpc_search_contacts(uuid, text, uuid, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_search_contacts(uuid, text, uuid, text, timestamptz, timestamptz, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_search_contacts(uuid, text, uuid, text, timestamptz, timestamptz, integer, integer) TO authenticated;