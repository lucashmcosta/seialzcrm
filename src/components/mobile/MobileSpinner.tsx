import { SpinnerGap } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface MobileSpinnerProps {
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Mobile loading spinner — green animated spinner for consistency across mobile views.
 * sm: inline/load-more indicator. md: full-area loader.
 */
export function MobileSpinner({ size = 'md', className }: MobileSpinnerProps) {
  return (
    <SpinnerGap
      className={cn(
        'animate-spin text-primary',
        size === 'sm' ? 'h-4 w-4' : 'h-6 w-6',
        className
      )}
      weight="bold"
    />
  );
}
