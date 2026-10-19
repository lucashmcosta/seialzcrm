import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { metaCapabilities } from '@/lib/meta-capabilities';
export function useMetaCapabilities(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey:['meta-capabilities',orgId,enabled], enabled:!!orgId, staleTime:15_000,
    queryFn:async()=>{
      const [connections,assets,routes] = await Promise.all([
        supabase.from('meta_connections').select('id,status,activation_state,last_health,expires_at,data_access_expires_at,granted_scopes').eq('organization_id',orgId!).order('created_at',{ascending:false}),
        supabase.from('meta_assets').select('connection_id,asset_type,selection_state').eq('organization_id',orgId!).eq('selection_state','selected'),
        supabase.from('meta_operational_routes').select('route,source,connection_id').eq('organization_id',orgId!),
      ]);
      for (const result of [connections,assets,routes]) if (result.error) throw result.error;
      return metaCapabilities(connections.data ?? [],assets.data ?? [],routes.data ?? [],enabled);
    },
  });
}
