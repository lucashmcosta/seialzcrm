import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PenNib } from '@phosphor-icons/react';
import { SendToSignatureButton } from './SendToSignatureButton';
import { SignatureV2Sheet } from './SignatureV2Sheet';
import { callSignatureRequests } from '@/lib/signatureRequestsApi';

interface Props { contactId: string; opportunityId: string; size?: 'default' | 'sm' | 'lg' | 'icon'; hidePilot?: boolean }

// Decide entre V1 (inalterada) e V2. A capability só decide NOVOS envios;
// solicitações V2 existentes continuam visíveis mesmo com a flag OFF.
export function ContractSignatureEntry({ contactId, opportunityId, size = 'icon', hidePilot = false }: Props) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['signature-capability', opportunityId],
    queryFn: () => callSignatureRequests<{ v2_enabled: boolean; pilot_enabled?: boolean; has_credentials: boolean; requests: any[] }>('get_capability', { opportunity_id: opportunityId }),
    staleTime: 30_000,
    retry: false,
  });
  const v2 = !!data?.v2_enabled;
  const pilot = !!data?.pilot_enabled;
  const hasV2Requests = (data?.requests?.length ?? 0) > 0;
  const [pilotOpen, setPilotOpen] = useState(false);

  // Botão V2 de piloto: ao lado, sem mudar a lógica do botão V1.
  const pilotButton = pilot && !v2 && !hidePilot ? (
    <>
      <Button variant="outline" size={size === 'icon' ? 'sm' : size} onClick={() => setPilotOpen(true)} aria-label="Enviar contrato V2 (Piloto)">
        <PenNib className="h-4 w-4 mr-2" weight="fill" />
        Enviar contrato V2 (Piloto)
      </Button>
      <SignatureV2Sheet open={pilotOpen} onOpenChange={setPilotOpen} opportunityId={opportunityId} canCreate />
    </>
  ) : null;

  if (!v2 && !hasV2Requests) {
    return <><SendToSignatureButton contactId={contactId} opportunityId={opportunityId} size={size} />{pilotButton}</>;
  }
  return (
    <>
      {!v2 && <SendToSignatureButton contactId={contactId} opportunityId={opportunityId} size={size} />}
      {pilotButton}
      {!pilot && (
        <Button variant="outline" size={size} onClick={() => setOpen(true)} aria-label="Assinaturas">
          <PenNib className={size === 'icon' ? 'h-4 w-4' : 'h-4 w-4 mr-2'} weight={v2 ? 'fill' : 'regular'} />
          {size !== 'icon' && (v2 ? 'Enviar contrato' : 'Assinaturas')}
        </Button>
      )}
      <SignatureV2Sheet open={open} onOpenChange={setOpen} opportunityId={opportunityId} canCreate={v2} />
    </>
  );
}

// Item "Enviar contrato V2 (Piloto)" para menus (3 pontinhos).
export function useSignatureV2Pilot(opportunityId: string) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['signature-capability', opportunityId],
    queryFn: () => callSignatureRequests<{ v2_enabled: boolean; pilot_enabled?: boolean; has_credentials: boolean; requests: any[] }>('get_capability', { opportunity_id: opportunityId }),
    staleTime: 30_000,
    retry: false,
  });
  const available = !!data?.pilot_enabled && !data?.v2_enabled;
  const sheet = available ? <SignatureV2Sheet open={open} onOpenChange={setOpen} opportunityId={opportunityId} canCreate /> : null;
  return { available, openSheet: () => setOpen(true), sheet };
}
