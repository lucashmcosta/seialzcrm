import { cn } from '@/lib/utils';

interface EndpointBadgeProps {
  externalAddress: string | null | undefined;
  className?: string;
  /** "lg" = chat header, "sm" = list item */
  size?: 'sm' | 'lg';
  /** Dígitos normalizados dos números "oficiais" da org. Se o endereço bater,
   *  o badge é ocultado — somente senders secundários exibem "via …NNNN". */
  officialNumbers?: Set<string>;
  /** Cor semântica do badge. `blue` = /messages, `amber` = /inbox. */
  tone?: 'blue' | 'amber';
}

const TONE_CLASSES: Record<NonNullable<EndpointBadgeProps['tone']>, string> = {
  blue: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

/**
 * Small "Novo · XXXX" pill that identifies which WhatsApp number a
 * conversation entered through. Renders nothing if no address or if
 * the address corresponds to one of the org's official numbers.
 */
export function EndpointBadge({
  externalAddress,
  className,
  size = 'sm',
  officialNumbers,
  tone = 'blue',
}: EndpointBadgeProps) {
  if (!externalAddress) return null;
  const digits = externalAddress.replace(/\D/g, '');
  if (officialNumbers && digits && officialNumbers.has(digits)) return null;
  const suffix = digits.slice(-4) || externalAddress;
  return (
    <span
      title={externalAddress}
      className={cn(
        'inline-flex items-center shrink-0 rounded-full border font-semibold',
        TONE_CLASSES[tone],
        size === 'lg' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0 text-[10px] leading-[14px]',
        className,
      )}
    >
      Novo · {suffix}
    </span>
  );
}
