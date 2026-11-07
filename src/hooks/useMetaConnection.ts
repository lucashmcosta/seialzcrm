import { operationallyReady } from '../../supabase/functions/_shared/meta/operational';
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Espelha, no frontend, a regra única do backend (resolveOrgMetaToken / resolveOrgAdsAccess):
// a credencial canônica está ativa quando existe uma Meta Connection **conectada e
// saudável** E (a flag `meta_canonical_credential` está ligada para a org OU a org NÃO
// tem credencial legada utilizável para a capability). Org com legado e flag OFF segue
// no caminho legado — idêntico ao de hoje. Tudo escopado por organization_id
// (multi-tenant; sem hardcode de org/conexão).
//
// `hasLegacyCredential` é calculado SEM trazer token/ciphertext ao cliente: as queries
// filtram pela presença do campo e selecionam só `id` + slug.
export interface MetaConnectionInfo {
  id: string;
  status: string;
  token_type: string | null;
  authorizing_meta_user_name: string | null;
  granted_scopes: string[] | null;
  last_health: string | null;
  activation_state: string;
  expires_at: string | null;
  data_access_expires_at: string | null;
  last_token_check_at: string | null;
}

export interface MetaConnectionState {
  connection: MetaConnectionInfo | null;
  flagOn: boolean;
  /** Conexão da org conectada e sem estado de saúde ruim (expired/error). */
  healthy: boolean;
  /** A org tem credencial legada utilizável p/ esta capability (mesma definição do backend). */
  hasLegacyCredential: boolean;
  /** (flagOn || !hasLegacyCredential) && healthy. Fonte única do "modo canônico" da UI. */
  canonicalActive: boolean;
  isLoading: boolean;
}

const CANONICAL_FLAG = "meta_canonical_credential";

/**
 * Qual credencial legada cada capability usa no backend:
 *  - lead-generation → token System User do slug `meta-lead-ads`
 *  - capi            → token próprio do slug `meta-capi`
 *  - demais (Ads/Performance, `asset:*`) → qualquer um (mesma união do get_meta_credentials)
 */
export function legacyCredentialFor(
  capability: string,
  rows: { tokenSlugs: string[]; capiToken: boolean },
): boolean {
  if (capability.startsWith('lead-generation')) return rows.tokenSlugs.includes('meta-lead-ads');
  if (capability === 'capi') return rows.capiToken;
  return rows.tokenSlugs.length > 0 || rows.capiToken;
}

/** Regra única: canônico se (flag ON ou sem legado) e conexão saudável. */
export function computeCanonicalActive(flagOn: boolean, hasLegacyCredential: boolean, healthy: boolean): boolean {
  return (flagOn || !hasLegacyCredential) && healthy;
}

export function useMetaConnection(orgId?: string | null, capability = 'lead-generation'): MetaConnectionState {
  const { data, isLoading } = useQuery({
    queryKey: ["meta-connection-state", orgId, capability],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: route, error: routeError } = await supabase.from('meta_operational_routes')
        .select('source,connection_id').eq('organization_id',orgId!).eq('route',capability).maybeSingle();
      if (routeError) throw routeError;
      let q = supabase.from('meta_connections')
        .select('id,status,token_type,authorizing_meta_user_name,granted_scopes,last_health,last_token_check_at,activation_state,expires_at,data_access_expires_at')
        .eq('organization_id',orgId!).eq('status','connected').eq('activation_state','ready')
        .order('created_at',{ascending:false}).limit(1);
      if (route?.connection_id) q = q.eq('id',route.connection_id);
      const [connRes,flagRes,sutRes,capiRes] = await Promise.all([
        route?.source === 'legacy' ? Promise.resolve({data:null,error:null}) : q.maybeSingle(),
        supabase.rpc('fn_feature_flag_enabled',{_flag_key:CANONICAL_FLAG,_organization_id:orgId!}),
        // Só `id`/slug voltam: o filtro de presença roda no banco, o ciphertext não sai.
        supabase.from('organization_integrations').select('id, admin_integrations!inner(slug)')
          .eq('organization_id',orgId!).eq('is_enabled',true)
          .in('admin_integrations.slug',['meta','meta-lead-ads'])
          .not('connected_account->>system_user_token_encrypted','is',null),
        supabase.from('organization_integrations').select('id, admin_integrations!inner(slug)')
          .eq('organization_id',orgId!).eq('is_enabled',true)
          .eq('admin_integrations.slug','meta-capi')
          .not('connected_account->>access_token_encrypted','is',null),
      ]);
      if (connRes.error) throw connRes.error;
      // Falha ao ler o sinal legado ⇒ assume legado presente (comportamento anterior, sem regressão).
      const legacyUnknown = !!sutRes.error || !!capiRes.error;
      const tokenSlugs = ((sutRes.data ?? []) as Array<{ admin_integrations: { slug: string } | null }>)
        .map((r) => r.admin_integrations?.slug).filter((x): x is string => !!x);
      const hasLegacyCredential = legacyUnknown ||
        legacyCredentialFor(capability, { tokenSlugs, capiToken: (capiRes.data ?? []).length > 0 });
      const connection = (connRes.data as MetaConnectionInfo | null) ?? null;
      const flagOn = flagRes.data === true;
      return { connection, flagOn, hasLegacyCredential };
    },
  });

  const connection = data?.connection ?? null;
  const flagOn = data?.flagOn ?? false;
  // Enquanto carrega, assume legado (default seguro = comportamento anterior).
  const hasLegacyCredential = data?.hasLegacyCredential ?? true;
  // A query já filtra status='connected'; consideramos saudável salvo estado de saúde
  // explicitamente ruim (expired/error). Conexão ausente => não saudável => legado.
  const healthy = !!connection && operationallyReady(connection,capability === 'lead-generation' ? ['leads_retrieval'] : []);
  const canonicalActive = computeCanonicalActive(flagOn, hasLegacyCredential, healthy);

  return { connection, flagOn, healthy, hasLegacyCredential, canonicalActive, isLoading };
}
