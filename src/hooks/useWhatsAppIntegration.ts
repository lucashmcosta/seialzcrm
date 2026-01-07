import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

interface WhatsAppConfig {
  account_sid: string;
  whatsapp_number: string;
  whatsapp_from: string;
  use_sandbox: boolean;
}

export function useWhatsAppIntegration() {
  const { organization } = useOrganization();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['whatsapp-integration', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;

      const { data, error } = await supabase
        .from('organization_integrations')
        .select(`
          id,
          is_enabled,
          config_values,
          connected_at,
          admin_integrations!inner(slug, name)
        `)
        .eq('organization_id', organization.id)
        .eq('admin_integrations.slug', 'twilio-whatsapp')
        .eq('is_enabled', true)
        .maybeSingle();

      if (error) {
        console.error('Error fetching WhatsApp integration:', error);
        return null;
      }

      return data;
    },
    enabled: !!organization?.id,
  });

  const config = data?.config_values as unknown as WhatsAppConfig | null;

  return {
    hasWhatsApp: !!data && data.is_enabled,
    whatsappNumber: config?.whatsapp_number || null,
    whatsappFrom: config?.whatsapp_from || null,
    useSandbox: config?.use_sandbox || false,
    loading: isLoading,
    integrationId: data?.id,
    refetch,
  };
}
