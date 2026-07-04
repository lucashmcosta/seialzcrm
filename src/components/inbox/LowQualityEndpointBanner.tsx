// Banner de alerta de qualidade Meta LOW para endpoints em modo restrito.
// Usa `getLowEndpointConfig` (hardcoded no complianceGuards) — some sozinho
// quando o prazo do modo LOW expira, sem precisar remover código depois.

import { WarningCircle } from '@phosphor-icons/react';
import { getLowEndpointConfig } from '@/lib/complianceGuards';

interface Props {
  endpointId: string | null | undefined;
  className?: string;
}

export function LowQualityEndpointBanner({ endpointId, className }: Props) {
  const cfg = getLowEndpointConfig(endpointId);
  if (!cfg) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-2 px-3 py-2 bg-amber-500/10 border-y border-amber-500/30 text-amber-900 dark:text-amber-200 ${className ?? ''}`}
    >
      <WarningCircle size={16} weight="fill" className="flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
      <p className="text-[12px] leading-snug">
        <span className="font-semibold">Número em recuperação de qualidade Meta.</span>{' '}
        Templates de marketing e reativações estão temporariamente limitados.
      </p>
    </div>
  );
}
