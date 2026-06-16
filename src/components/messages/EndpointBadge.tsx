import { cn } from '@/lib/utils';

interface EndpointBadgeProps {
  externalAddress: string | null | undefined;
  className?: string;
  /** "lg" = chat header, "sm" = list item */
  size?: 'sm' | 'lg';
}

/**
 * Small "via …XXXX" pill that identifies which WhatsApp number a
 * conversation entered through. Renders nothing if no address.
 */
export function EndpointBadge({ externalAddress, className, size = 'sm' }: EndpointBadgeProps) {
  if (!externalAddress) return null;
  const digits = externalAddress.replace(/\D/g, '');
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
