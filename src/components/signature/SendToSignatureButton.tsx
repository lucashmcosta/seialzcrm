import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { PenTool } from 'lucide-react';
import { toast } from 'sonner';

interface SendToSignatureButtonProps {
  contactId: string;
  opportunityId?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function SendToSignatureButton({ contactId, opportunityId, size = 'sm' }: SendToSignatureButtonProps) {
  const { organization } = useOrganization();
  const [suvsignConfig, setSuvsignConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organization?.id) return;

    const fetchConfig = async () => {
      // Check if org has SuvSign integration enabled
      const { data: orgIntegration } = await supabase
        .from('organization_integrations')
        .select('*, integration:admin_integrations!inner(*)')
        .eq('organization_id', organization.id)
        .eq('is_enabled', true)
        .eq('integration.slug', 'suvsign')
        .maybeSingle();

      if (orgIntegration) {
        setSuvsignConfig(orgIntegration.config_values);
      }
      setLoading(false);
    };

    fetchConfig();
  }, [organization?.id]);

  if (loading || !suvsignConfig) return null;

  const handleSendToSignature = async () => {
    try {
      // Fetch contact data
      const { data: contact } = await supabase
        .from('contacts')
        .select('full_name, first_name, last_name, email, phone')
        .eq('id', contactId)
        .single();

      if (!contact) {
        toast.error('Contato não encontrado');
        return;
      }

      const payload: any = {
        client: {
          firstName: contact.first_name || contact.full_name,
          lastName: contact.last_name || '',
          email: contact.email || '',
          phone: contact.phone || '',
        },
        custom: {} as Record<string, string>,
      };

      // If there's an opportunity, fetch its data
      if (opportunityId) {
        const { data: opportunity } = await supabase
          .from('opportunities')
          .select('id, title, amount, currency')
          .eq('id', opportunityId)
          .single();

        if (opportunity) {
          payload.custom.deal_id = opportunity.id;
          payload.custom.deal_title = opportunity.title;
          if (opportunity.amount) {
            payload.custom.deal_amount = String(opportunity.amount);
          }
        }
      }

      const baseUrl = suvsignConfig.base_url || 'https://suvsign.com';
      const templateId = suvsignConfig.template_id;
      const connectorId = suvsignConfig.connector_id;

      if (!templateId || !connectorId) {
        toast.error('Configuração do SuvSign incompleta. Verifique template_id e connector_id.');
        return;
      }

      const url = `${baseUrl}/create-from-template?template_id=${encodeURIComponent(templateId)}&connector_id=${encodeURIComponent(connectorId)}&data=${encodeURIComponent(JSON.stringify(payload))}`;

      window.open(url, '_blank');
    } catch (error) {
      console.error('Error sending to signature:', error);
      toast.error('Erro ao enviar para assinatura');
    }
  };

  return (
    <Button variant="outline" size={size} onClick={handleSendToSignature}>
      <PenTool className="h-4 w-4 mr-2" />
      Enviar para Assinatura
    </Button>
  );
}
