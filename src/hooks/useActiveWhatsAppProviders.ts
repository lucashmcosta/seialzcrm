import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Detecta quais providers WhatsApp estão ativos (is_enabled=true) na org:
 * - twilio-whatsapp
 * - meta-whatsapp-cloud
 *
 * Usado pela tela de Templates para decidir quando mostrar dropdowns
 * de seleção de provider em "Novo Template" / "Sincronizar".
 */
export function useActiveWhatsAppProviders(orgId: string | undefined) {
  const query = useQuery({
    queryKey: ['whatsapp-active-providers', orgId],
    queryFn: async () => {
      if (!orgId) return { hasTwilio: false, hasMeta: false };
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('id, is_enabled, admin_integrations!inner(slug)')
        .eq('organization_id', orgId)
        .eq('is_enabled', true)
        .in('admin_integrations.slug', ['twilio-whatsapp', 'meta-whatsapp-cloud']);

      if (error) {
        console.warn('[useActiveWhatsAppProviders] load failed', error.message);
        return { hasTwilio: false, hasMeta: false };
      }

      const slugs = new Set(
        (data ?? []).map((r: any) => r.admin_integrations?.slug).filter(Boolean),
      );
      return {
        hasTwilio: slugs.has('twilio-whatsapp'),
        hasMeta: slugs.has('meta-whatsapp-cloud'),
      };
    },
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
  });

  return {
    hasTwilio: query.data?.hasTwilio ?? false,
    hasMeta: query.data?.hasMeta ?? false,
    loading: query.isLoading,
  };
}
