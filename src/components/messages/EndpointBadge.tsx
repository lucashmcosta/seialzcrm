import { cn } from '@/lib/utils';

interface EndpointBadgeProps {
  externalAddress: string | null | undefined;
  className?: string;
  /** "lg" = chat header, "sm" = list item */
  size?: 'sm' | 'lg';
  /** Dígitos normalizados dos números "oficiais" da org. Se o endereço bater,
   *  o badge é ocultado — somente senders secundários exibem "via …NNNN". */
  officialNumbers?: Set<string>;
}

/**
 * Small "via …XXXX" pill that identifies which WhatsApp number a
 * conversation entered through. Renders nothing if no address or if
 * the address corresponds to one of the org's official numbers.
 */
export function EndpointBadge({
  externalAddress,
  className,
  size = 'sm',
  officialNumbers,
}: EndpointBadgeProps) {
  if (!externalAddress) return null;
  const digits = externalAddress.replace(/\D/g, '');
  if (officialNumbers && digits && officialNumbers.has(digits)) return null;
  const suffix = digits.slice(-4) || externalAddress;
  return (
    <span
      title={externalAddress}
      className={cn(
        'inline-flex items-center shrink-0 rounded-full border border-border bg-muted text-muted-foreground font-medium',
        size === 'lg' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0 text-[10px] leading-[14px]',
        className,
      )}
    >
      via …{suffix}
    </span>
  );
}
