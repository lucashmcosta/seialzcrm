import { cn } from '@/lib/utils';

type Tone = 'blue' | 'amber' | 'rose' | 'violet';

interface EndpointBadgeProps {
  externalAddress: string | null | undefined;
  className?: string;
  /** "lg" = chat header, "sm" = list item */
  size?: 'sm' | 'lg';
  /** Dígitos normalizados dos números "oficiais" da org. Se o endereço bater,
   *  o badge é ocultado. Não usado quando `purpose` está definido. */
  officialNumbers?: Set<string>;
  /** Cor semântica explícita (fallback). Ignorada se `purpose` for passado. */
  tone?: Tone;
  /** Purpose do endpoint no banco. Se passado, define a cor pelo mapa fixo. */
  purpose?: string | null;
}

const TONE_CLASSES: Record<Tone, string> = {
  blue: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400',
};

/** Mapa fixo purpose -> cor. Novos purposes caem em `violet` (desconhecido). */
function toneFromPurpose(purpose: string | null | undefined): Tone {
  switch ((purpose || '').toLowerCase()) {
    case 'customer_service':
    case 'support':
      return 'amber';
    case 'sales':
    case 'commercial':
      return 'blue';
    case 'marketing':
      return 'rose';
    default:
      return 'violet';
  }
}

/**
 * Small "Novo · XXXX" pill that identifies which WhatsApp number a
 * conversation entered through. Cor derivada do purpose do endpoint
 * quando disponível; senão usa `tone` explícito.
 */
export function EndpointBadge({
  externalAddress,
  className,
  size = 'sm',
  officialNumbers,
  tone = 'blue',
  purpose,
}: EndpointBadgeProps) {
  if (!externalAddress) return null;
  const digits = externalAddress.replace(/\D/g, '');
  // Supressão por números oficiais só se aplica quando NÃO houver purpose
  // (regra antiga de /messages preservada como fallback).
  if (purpose == null && officialNumbers && digits && officialNumbers.has(digits)) return null;
  const resolvedTone: Tone = purpose != null ? toneFromPurpose(purpose) : tone;
  const suffix = digits.slice(-4) || externalAddress;
  return (
    <span
      title={externalAddress}
      className={cn(
        'inline-flex items-center shrink-0 rounded-full border font-semibold',
        TONE_CLASSES[resolvedTone],
        size === 'lg' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0 text-[10px] leading-[14px]',
        className,
      )}
    >
      Novo · {suffix}
    </span>
  );
}
