import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

interface KpiCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  delta?: number | null; // percentage change vs previous period
  icon?: PhosphorIcon;
  accent?: 'primary' | 'success' | 'destructive' | 'warning';
  loading?: boolean;
  mono?: boolean;
  onClick?: () => void;
}


const accentColor = {
  primary: 'text-primary',
  success: 'text-success',
  destructive: 'text-destructive',
  warning: 'text-warning',
};

export function KpiCard({
  label,
  value,
  sublabel,
  delta,
  icon: Icon,
  accent = 'primary',
  loading,
  mono,
}: KpiCardProps) {
  const renderDelta = () => {
    if (delta == null || !isFinite(delta)) return null;
    const isUp = delta > 0;
    const isFlat = delta === 0;
    const Arrow = isFlat ? Minus : isUp ? ArrowUp : ArrowDown;
    const color = isFlat
      ? 'text-muted-foreground'
      : isUp
        ? 'text-success'
        : 'text-destructive';
    return (
      <div className={cn('flex items-center gap-1 text-xs font-medium', color)}>
        <Arrow size={12} weight="bold" />
        <span>{Math.abs(delta).toFixed(1)}%</span>
      </div>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-card p-5 transition-shadow hover:shadow-sm">
      {/* Subtle accent gradient */}
      <div
        className={cn(
          'absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.07]',
          accent === 'primary' && 'bg-primary',
          accent === 'success' && 'bg-success',
          accent === 'destructive' && 'bg-destructive',
          accent === 'warning' && 'bg-warning',
        )}
      />

      <div className="relative flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-muted" />
          ) : (
            <p
              className={cn(
                'mt-1.5 truncate text-2xl font-semibold',
                accentColor[accent],
                mono && 'font-mono tracking-tight',
              )}
            >
              {value}
            </p>
          )}
          {sublabel && !loading && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{sublabel}</p>
          )}
          {!loading && delta != null && <div className="mt-2">{renderDelta()}</div>}
        </div>
        {Icon && (
          <div
            className={cn(
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md',
              accent === 'primary' && 'bg-primary/10',
              accent === 'success' && 'bg-success/10',
              accent === 'destructive' && 'bg-destructive/10',
              accent === 'warning' && 'bg-warning/10',
            )}
          >
            <Icon size={20} weight="light" className={accentColor[accent]} />
          </div>
        )}
      </div>
    </div>
  );
}
