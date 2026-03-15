import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { PenNib } from '@phosphor-icons/react';
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
        .select('full_name, first_name, last_name, email, phone, cpf, rg, rg_issuer, nationality, address_street, address_neighborhood, address_city, address_state, address_zip')
        .eq('id', contactId)
        .single();

      if (!contact) {
        toast.error('Contato não encontrado');
        return;
      }

      // Validate required fields
      const firstName = contact.first_name || contact.full_name?.split(' ')[0] || '';
      const missingFields: string[] = [];

      if (!firstName) missingFields.push('Nome');
      if (!contact.email) missingFields.push('Email');
      if (!contact.phone) missingFields.push('Telefone');
      if (!contact.cpf) missingFields.push('CPF');
      if (!contact.rg) missingFields.push('RG');
      if (!contact.rg_issuer) missingFields.push('Órgão Emissor do RG');
      if (!contact.nationality) missingFields.push('Nacionalidade');
      if (!contact.address_street) missingFields.push('Endereço');
      if (!contact.address_neighborhood) missingFields.push('Bairro');
      if (!contact.address_city) missingFields.push('Cidade');
      if (!contact.address_state) missingFields.push('Estado');
      if (!contact.address_zip) missingFields.push('CEP');

      if (missingFields.length > 0) {
        toast.error(`Campos obrigatórios não preenchidos: ${missingFields.join(', ')}`);
        return;
      }

      const payload: any = {
        client: {
          firstName: contact.first_name || contact.full_name?.split(' ')[0] || '',
          lastName: contact.last_name || contact.full_name?.split(' ').slice(1).join(' ') || '',
          email: contact.email || '',
          phone: contact.phone || '',
        },
        custom: {
          contact_id: contactId,
          ...(contact.cpf && { cpf: contact.cpf }),
          ...(contact.rg && { rg: contact.rg }),
          ...(contact.rg_issuer && { rg_issuer: contact.rg_issuer }),
          ...(contact.nationality && { nationality: contact.nationality }),
          ...(contact.address_street && { address_street: contact.address_street }),
          ...(contact.address_neighborhood && { address_neighborhood: contact.address_neighborhood }),
          ...(contact.address_city && { address_city: contact.address_city }),
          ...(contact.address_state && { address_state: contact.address_state }),
          ...(contact.address_zip && { address_zip: contact.address_zip }),
        } as Record<string, string>,
      };

      // If there's an opportunity, fetch its data
      if (opportunityId) {
        const { data: opportunity } = await supabase
          .from('opportunities')
          .select('id, title, amount, currency, close_date')
          .eq('id', opportunityId)
          .single();

        if (opportunity) {
          payload.custom.deal_id = opportunity.id;
          payload.custom.deal_title = opportunity.title;
          if (opportunity.amount) {
            payload.custom.deal_amount = String(opportunity.amount);
          }
          if (opportunity.close_date) {
            const date = new Date(opportunity.close_date + 'T00:00:00');
            payload.custom.deal_close_date = date.toLocaleDateString('pt-BR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            });
          }
        }
      }

      const baseUrl = suvsignConfig.base_url || 'https://suvsign.com';
      const templateId = suvsignConfig.template_id;
      const connectorId = suvsignConfig.connector_id;

      if (!connectorId) {
        toast.error('Configuração do SuvSign incompleta. Verifique o connector_id.');
        return;
      }

      const params = new URLSearchParams();
      if (templateId) {
        params.set('template_id', templateId);
      }
      params.set('connector_id', connectorId);
      params.set('data', JSON.stringify(payload));
      const url = `${baseUrl}/create-from-template?${params.toString()}`;

      window.open(url, '_blank');
    } catch (error) {
      console.error('Error sending to signature:', error);
      toast.error('Erro ao enviar para assinatura');
    }
  };

  return (
    <Button variant="outline" size={size} onClick={handleSendToSignature}>
      <PenNib className="h-4 w-4 mr-2" />
      Enviar para Assinatura
    </Button>
  );
}
