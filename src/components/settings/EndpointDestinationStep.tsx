// ============================================================================
// Passo "Destino" do provisionamento de números WhatsApp (contrato Fase 3).
//
// Comercial          → número compartilhado do time de vendas (Route Comercial)
// Atendimento        → número da Route de Atendimento
// Pessoal            → número de um vendedor específico (obrigatório escolher o
//                      usuário; a autorização de resposta vem exclusivamente de
//                      `assigned_user_id`)
//
// Este componente é apenas apresentação: toda validação real acontece em
// `provision_line_endpoint` no banco.
// ============================================================================

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useOrgActiveUsers } from '@/hooks/settings/useOrgActiveUsers';

export type EndpointDestination = 'commercial' | 'customer_service' | 'vendor_personal';

export const DESTINATION_LABEL: Record<EndpointDestination, string> = {
  commercial: 'Comercial',
  customer_service: 'Atendimento',
  vendor_personal: 'Pessoal',
};

interface Props {
  organizationId?: string | null;
  destination: EndpointDestination;
  onDestinationChange: (value: EndpointDestination) => void;
  assignedUserId: string | null;
  onAssignedUserChange: (value: string | null) => void;
  disabled?: boolean;
}

export function EndpointDestinationStep({
  organizationId,
  destination,
  onDestinationChange,
  assignedUserId,
  onAssignedUserChange,
  disabled,
}: Props) {
  const { users, isLoading } = useOrgActiveUsers(
    destination === 'vendor_personal' ? organizationId : null,
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Destino do número</Label>
        <RadioGroup
          value={destination}
          onValueChange={(v) => {
            const next = v as EndpointDestination;
            onDestinationChange(next);
            if (next !== 'vendor_personal') onAssignedUserChange(null);
          }}
          disabled={disabled}
          className="gap-2"
        >
          <div className="flex items-start gap-2">
            <RadioGroupItem value="commercial" id="dest-commercial" className="mt-0.5" />
            <Label htmlFor="dest-commercial" className="font-normal cursor-pointer leading-tight">
              Comercial
              <span className="block text-[11px] text-muted-foreground">
                Número compartilhado do time de vendas.
              </span>
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <RadioGroupItem value="customer_service" id="dest-cs" className="mt-0.5" />
            <Label htmlFor="dest-cs" className="font-normal cursor-pointer leading-tight">
              Atendimento
              <span className="block text-[11px] text-muted-foreground">
                Número do time de atendimento ao cliente.
              </span>
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <RadioGroupItem value="vendor_personal" id="dest-personal" className="mt-0.5" />
            <Label htmlFor="dest-personal" className="font-normal cursor-pointer leading-tight">
              Pessoal
              <span className="block text-[11px] text-muted-foreground">
                Número de um vendedor. Só o responsável pode responder por ele.
              </span>
            </Label>
          </div>
        </RadioGroup>
      </div>

      {destination === 'vendor_personal' && (
        <div className="space-y-2">
          <Label>Responsável pelo número</Label>
          <Select
            value={assignedUserId ?? undefined}
            onValueChange={(v) => onAssignedUserChange(v)}
            disabled={disabled || isLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder={isLoading ? 'Carregando…' : 'Selecione o usuário'} />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Obrigatório. A conversa continua visível para todo o time; apenas a resposta
            por este número fica restrita ao responsável.
          </p>
        </div>
      )}
    </div>
  );
}
