import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

// AI integration slugs that enable AI Agent and Knowledge Base features
const AI_INTEGRATION_SLUGS = ['openai-gpt', 'claude-ai', 'lovable-ai'];

export function useAIIntegration() {
  const { organization } = useOrganization();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ai-integration', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;

      const { data, error } = await supabase
        .from('organization_integrations')
        .select(`
          id,
          is_enabled,
          config_values,
          connected_at,
          admin_integrations!inner(slug, name, category)
        `)
        .eq('organization_id', organization.id)
        .eq('is_enabled', true)
        .in('admin_integrations.slug', AI_INTEGRATION_SLUGS);

      if (error) {
        console.error('Error fetching AI integration:', error);
        return null;
      }

      return data && data.length > 0 ? data : null;
    },
    enabled: !!organization?.id,
  });

  // Get the first enabled AI integration
  const activeIntegration = data?.[0];
  const integrationInfo = activeIntegration?.admin_integrations as { slug: string; name: string; category: string } | undefined;

  return {
    hasAI: !!data && data.length > 0,
    activeProvider: integrationInfo?.slug || null,
    providerName: integrationInfo?.name || null,
    loading: isLoading,
    integrationId: activeIntegration?.id,
    refetch,
  };
}
