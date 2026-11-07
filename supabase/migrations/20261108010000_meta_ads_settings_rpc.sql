-- Segurança: get_meta_credentials (SECURITY DEFINER, sem checagem de membership)
-- devolve token cifrado + connected_account bruto de QUALQUER org. Passa a ser
-- exclusiva de service_role (edge functions). O frontend (AdsManagerConfig) usa
-- get_meta_ads_settings: checa membership ativa e só devolve campos não-secretos.
-- Ordem de deploy: aplicar ANTES do frontend novo (o novo RPC já existe quando o
-- bundle novo sobe). Entre o revoke e o merge do frontend, o card de Ads Manager
-- do bundle antigo só perde o "ad account atual" (o RPC falha e o código ignora o erro).

CREATE OR REPLACE FUNCTION public.get_meta_ads_settings(p_org_id uuid)
RETURNS TABLE(is_connected boolean, ad_account_id text, feature_ads_manager_sync boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mesma fonte de membership das RLS (user_organizations.is_active = true).
  IF p_org_id IS NULL OR NOT (p_org_id = ANY (public.current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden_org' USING ERRCODE = '42501';
  END IF;

  -- Reaproveita a regra de merge (meta / meta-lead-ads / meta-capi) da função
  -- legada, projetando só o que o card precisa. Nada de token/raw_*.
  RETURN QUERY
  SELECT c.is_connected, c.ad_account_id, c.feature_ads_manager_sync
  FROM public.get_meta_credentials(p_org_id) c;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_meta_ads_settings(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_meta_ads_settings(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_meta_ads_settings(uuid) TO authenticated;

-- get_meta_credentials: somente service_role (owner postgres mantém, para o wrapper acima).
REVOKE EXECUTE ON FUNCTION public.get_meta_credentials(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_meta_credentials(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_meta_credentials(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_meta_credentials(uuid) TO service_role;
