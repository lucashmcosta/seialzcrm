import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { OrgEndpoint } from '@/hooks/useOrgWhatsAppEndpoints';

interface EndpointSelectorProps {
  endpoints: OrgEndpoint[];
  value: string | null;
  onChange: (endpointId: string) => void;
  disabled?: boolean;
  locale: 'pt-BR' | 'en-US';
}

/**
 * Lets the user pick which WhatsApp number to send the next outbound
 * message from. The choice is per-send only — it never changes the
 * thread's primary_endpoint_id. Renders nothing when fewer than 2
 * active endpoints exist.
 */
export function EndpointSelector({
  endpoints,
  value,
  onChange,
  disabled,
  locale,
}: EndpointSelectorProps) {
  if (endpoints.length < 2) return null;

  const label = (ep: OrgEndpoint) => {
    const digits = ep.external_address.replace(/\D/g, '');
    const suffix = digits.slice(-4) || ep.external_address;
    return `…${suffix} · ${ep.external_address}`;
  };

  return (
    <div className="flex items-center gap-2 px-1 pb-2">
      <span className="text-[11px] text-muted-foreground shrink-0">
        {locale === 'pt-BR' ? 'Enviar de' : 'Send from'}
      </span>
      <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-7 w-[260px] text-xs">
          <SelectValue placeholder={locale === 'pt-BR' ? 'Selecionar número' : 'Select number'} />
        </SelectTrigger>
        <SelectContent>
          {endpoints.map((ep) => (
            <SelectItem key={ep.id} value={ep.id} className="text-xs">
              {label(ep)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
