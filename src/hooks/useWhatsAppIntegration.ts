import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

interface WhatsAppConfig {
  account_sid: string;
  whatsapp_number: string;
  whatsapp_from: string;
  use_sandbox: boolean;
  messaging_service_sid?: string;
  available_numbers?: string[];
  webhooks_configured?: boolean;
  setup_completed_at?: string;
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
    staleTime: 1000 * 60 * 10, // 10 minutes — integration config rarely changes
    gcTime: 1000 * 60 * 30,
  });

  // hasWhatsApp deve refletir QUALQUER WhatsApp ativo (Twilio OU Meta Cloud).
  // Antes checava só 'twilio-whatsapp', então ao migrar pro Meta Cloud e desligar
  // o Twilio, os menus Mensagens/Templates/Respostas Rápidas sumiam indevidamente.
  const { data: anyWaEnabled } = useQuery({
    queryKey: ['whatsapp-any-enabled', organization?.id],
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    queryFn: async () => {
      if (!organization?.id) return false;
      const { data: rows, error } = await supabase
        .from('organization_integrations')
        .select('id, admin_integrations!inner(slug)')
        .eq('organization_id', organization.id)
        .eq('is_enabled', true)
        .in('admin_integrations.slug', ['twilio-whatsapp', 'meta-whatsapp-cloud']);
      if (error) {
        console.error('Error checking WhatsApp integrations:', error);
        return false;
      }
      return (rows?.length ?? 0) > 0;
    },
  });

  const config = data?.config_values as unknown as WhatsAppConfig | null;

  return {
    hasWhatsApp: !!anyWaEnabled,
    whatsappNumber: config?.whatsapp_number || null,
    whatsappFrom: config?.whatsapp_from || null,
    useSandbox: config?.use_sandbox || false,
    messagingServiceSid: config?.messaging_service_sid || null,
    availableNumbers: config?.available_numbers || [],
    webhooksConfigured: config?.webhooks_configured || false,
    setupCompletedAt: config?.setup_completed_at || null,
    loading: isLoading,
    integrationId: data?.id,
    refetch,
  };
}
