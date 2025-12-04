import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

interface VoiceConfig {
  twilioPhoneNumber?: string;
  enableRecording?: boolean;
}

interface UseVoiceIntegrationReturn {
  hasVoiceIntegration: boolean;
  voiceConfig: VoiceConfig | null;
  loading: boolean;
}

export function useVoiceIntegration(): UseVoiceIntegrationReturn {
  const { organization } = useOrganization();
  const [hasVoiceIntegration, setHasVoiceIntegration] = useState(false);
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkVoiceIntegration = async () => {
      if (!organization?.id) {
        setLoading(false);
        return;
      }

      try {
        // Check for any enabled voice/telephony integration
        const { data, error } = await supabase
          .from('organization_integrations')
          .select(`
            id,
            is_enabled,
            config_values,
            admin_integrations!inner (
              slug,
              category
            )
          `)
          .eq('organization_id', organization.id)
          .eq('is_enabled', true)
          .or('slug.eq.twilio-voice,category.eq.telephony', { referencedTable: 'admin_integrations' })
          .maybeSingle();

        if (error) {
          console.error('Error checking voice integration:', error);
          setHasVoiceIntegration(false);
          setVoiceConfig(null);
        } else if (data) {
          setHasVoiceIntegration(true);
          const configValues = data.config_values as Record<string, any> | null;
          setVoiceConfig({
            twilioPhoneNumber: configValues?.twilio_phone_number,
            enableRecording: configValues?.enable_recording ?? true,
          });
        } else {
          setHasVoiceIntegration(false);
          setVoiceConfig(null);
        }
      } catch (err) {
        console.error('Error in useVoiceIntegration:', err);
        setHasVoiceIntegration(false);
        setVoiceConfig(null);
      } finally {
        setLoading(false);
      }
    };

    checkVoiceIntegration();
  }, [organization?.id]);

  return { hasVoiceIntegration, voiceConfig, loading };
}
