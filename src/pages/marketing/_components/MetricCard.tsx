import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus } from '@phosphor-icons/react';
import { Skeleton } from '@/components/ui/skeleton';
import { computeDelta } from '../_lib/format';

interface Props {
  label: string;
  value: string | number;
  sublabel?: string;
  current?: number;
  previous?: number;
  loading?: boolean;
  accent?: 'primary' | 'success' | 'destructive' | 'warning';
  mono?: boolean;
}

const accentText = {
  primary: 'text-primary',
  success: 'text-success',
  destructive: 'text-destructive',
  warning: 'text-warning',
};

export function MetricCard({ label, value, sublabel, current, previous, loading, accent = 'primary', mono }: Props) {
  const delta = current != null && previous != null ? computeDelta(current, previous) : null;
  const renderDelta = () => {
    if (delta == null || !isFinite(delta)) return null;
    const isUp = delta > 0;
    const isFlat = Math.abs(delta) < 0.05;
    const Arrow = isFlat ? Minus : isUp ? ArrowUp : ArrowDown;
    const color = isFlat ? 'text-muted-foreground' : isUp ? 'text-success' : 'text-destructive';
    return (
      <div className={cn('flex items-center gap-1 text-xs font-medium', color)}>
        <Arrow size={12} weight="bold" />
        <span>{Math.abs(delta).toFixed(1)}% vs período anterior</span>
      </div>
    );
  };

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p className={cn('mt-1.5 text-2xl font-semibold', accentText[accent], mono && 'font-mono tracking-tight')}>
          {value}
        </p>
      )}
      {sublabel && !loading && <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>}
      {!loading && delta != null && <div className="mt-2">{renderDelta()}</div>}
    </div>
  );
}
