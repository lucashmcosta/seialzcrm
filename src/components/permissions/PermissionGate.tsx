import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** Quando `allowed` é falso, deixa o conteúdo desabilitado e mostra o motivo ao passar o mouse/tocar. */
export function PermissionGate({ allowed, reason, children, className }: {
  allowed: boolean; reason: string; children: ReactNode; className?: string;
}) {
  if (allowed) return <>{children}</>;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} aria-disabled="true" aria-label={reason} className={`inline-flex cursor-not-allowed ${className ?? ''}`}>
            <span className="pointer-events-none opacity-50 w-full">{children}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
