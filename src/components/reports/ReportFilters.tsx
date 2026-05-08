import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PeriodPreset, CustomRange } from '@/lib/report-period';

// Re-export for backward compatibility with existing imports.
export { computeRange } from '@/lib/report-period';
export type { PeriodPreset } from '@/lib/report-period';

// Backward-compat alias for previous DateRange-shaped value.
export type PeriodValue = {
  preset: PeriodPreset;
  from: Date;
  to: Date;
};

const PRESET_LABELS: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'this_week', label: 'Esta semana' },
  { value: 'last_week', label: 'Semana passada' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'last_7', label: 'Últimos 7 dias' },
  { value: 'last_30', label: 'Últimos 30 dias' },
  { value: 'last_90', label: 'Últimos 90 dias' },
  { value: 'last_365', label: 'Últimos 12 meses' },
  { value: 'custom', label: 'Período personalizado' },
];

function toDateInputValue(d?: Date) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(v: string): Date | undefined {
  if (!v) return undefined;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

interface Props {
  preset: PeriodPreset;
  onPresetChange: (p: PeriodPreset) => void;
  customRange?: CustomRange;
  onCustomRangeChange: (r: CustomRange | undefined) => void;
  ownerId?: string;
  onOwnerChange?: (v: string) => void;
  users?: { id: string; full_name: string }[];
  showOwner?: boolean;
}

export function ReportFilters({
  preset,
  onPresetChange,
  customRange,
  onCustomRangeChange,
  ownerId = 'all',
  onOwnerChange,
  users = [],
  showOwner = true,
}: Props) {
  const fromValue = useMemo(() => toDateInputValue(customRange?.from), [customRange?.from]);
  const toValue = useMemo(() => toDateInputValue(customRange?.to), [customRange?.to]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={preset} onValueChange={(v) => onPresetChange(v as PeriodPreset)}>
        <SelectTrigger className="w-56 rounded-md">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_LABELS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromValue}
            onChange={(e) =>
              onCustomRangeChange({
                from: fromDateInputValue(e.target.value),
                to: customRange?.to,
              })
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground">até</span>
          <input
            type="date"
            value={toValue}
            onChange={(e) =>
              onCustomRangeChange({
                from: customRange?.from,
                to: fromDateInputValue(e.target.value),
              })
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {showOwner && (
        <Select value={ownerId} onValueChange={onOwnerChange}>
          <SelectTrigger className="w-52 rounded-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vendedores</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
