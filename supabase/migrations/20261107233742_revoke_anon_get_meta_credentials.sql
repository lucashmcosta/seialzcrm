-- Segurança: get_meta_credentials é SECURITY DEFINER e não checa membership.
-- Remove a execução por anon/PUBLIC (chave pública do frontend). Mantém authenticated
-- (AdsManagerConfig ainda chama do cliente) e service_role (edge functions).
-- Próximo passo (PR separado): checar membership e não devolver token ao cliente.
REVOKE EXECUTE ON FUNCTION public.get_meta_credentials(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_meta_credentials(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_meta_credentials(uuid) TO authenticated, service_role;
