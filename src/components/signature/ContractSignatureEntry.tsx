import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PenNib } from '@phosphor-icons/react';
import { SendToSignatureButton } from './SendToSignatureButton';
import { SignatureV2Sheet } from './SignatureV2Sheet';
import { callSignatureRequests } from '@/lib/signatureRequestsApi';

interface Props { contactId: string; opportunityId: string; size?: 'default' | 'sm' | 'lg' | 'icon' }

// Decide entre V1 (inalterada) e V2. A capability só decide NOVOS envios;
// solicitações V2 existentes continuam visíveis mesmo com a flag OFF.
export function ContractSignatureEntry({ contactId, opportunityId, size = 'icon' }: Props) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['signature-capability', opportunityId],
    queryFn: () => callSignatureRequests<{ v2_enabled: boolean; has_credentials: boolean; requests: any[] }>('get_capability', { opportunity_id: opportunityId }),
    staleTime: 30_000,
    retry: false,
  });
  const v2 = !!data?.v2_enabled;
  const hasV2Requests = (data?.requests?.length ?? 0) > 0;

  if (!v2 && !hasV2Requests) {
    return <SendToSignatureButton contactId={contactId} opportunityId={opportunityId} size={size} />;
  }
  return (
    <>
      {!v2 && <SendToSignatureButton contactId={contactId} opportunityId={opportunityId} size={size} />}
      <Button variant="outline" size={size} onClick={() => setOpen(true)} aria-label="Assinaturas">
        <PenNib className={size === 'icon' ? 'h-4 w-4' : 'h-4 w-4 mr-2'} weight={v2 ? 'fill' : 'regular'} />
        {size !== 'icon' && (v2 ? 'Enviar contrato' : 'Assinaturas')}
      </Button>
      <SignatureV2Sheet open={open} onOpenChange={setOpen} opportunityId={opportunityId} canCreate={v2} />
    </>
  );
}
