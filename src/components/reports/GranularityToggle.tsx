import { cn } from '@/lib/utils';
import type { Granularity } from './trendBuckets';

interface Props {
  value: Granularity;
  onChange: (v: Granularity) => void;
}

export function GranularityToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
      {(
        [
          { value: 'daily' as Granularity, label: 'Diária' },
          { value: 'weekly' as Granularity, label: 'Semanal' },
        ]
      ).map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
