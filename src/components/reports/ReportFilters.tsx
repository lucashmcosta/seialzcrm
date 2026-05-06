import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { CalendarBlank } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_7'
  | 'last_30'
  | 'last_90'
  | 'last_365'
  | 'custom';

export interface PeriodValue {
  preset: PeriodPreset;
  from: Date;
  to: Date;
}

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

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function computeRange(preset: PeriodPreset, custom?: DateRange): { from: Date; to: Date } {
  const now = new Date();
  const today = startOfDay(now);

  switch (preset) {
    case 'today':
      return { from: today, to: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: y, to: endOfDay(y) };
    }
    case 'this_week': {
      const day = today.getDay(); // 0=sun
      const diff = day === 0 ? 6 : day - 1; // monday start
      const from = new Date(today);
      from.setDate(from.getDate() - diff);
      return { from, to: endOfDay(now) };
    }
    case 'last_week': {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(today);
      thisMonday.setDate(thisMonday.getDate() - diff);
      const from = new Date(thisMonday);
      from.setDate(from.getDate() - 7);
      const to = new Date(thisMonday);
      to.setDate(to.getDate() - 1);
      return { from, to: endOfDay(to) };
    }
    case 'this_month': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from, to: endOfDay(now) };
    }
    case 'last_month': {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from, to: endOfDay(to) };
    }
    case 'last_7':
    case 'last_30':
    case 'last_90':
    case 'last_365': {
      const days = preset === 'last_7' ? 7 : preset === 'last_30' ? 30 : preset === 'last_90' ? 90 : 365;
      const from = new Date(today);
      from.setDate(from.getDate() - (days - 1));
      return { from, to: endOfDay(now) };
    }
    case 'custom': {
      if (custom?.from && custom?.to) {
        return { from: startOfDay(custom.from), to: endOfDay(custom.to) };
      }
      if (custom?.from) {
        return { from: startOfDay(custom.from), to: endOfDay(custom.from) };
      }
      return { from: today, to: endOfDay(now) };
    }
  }
}

interface Props {
  preset: PeriodPreset;
  onPresetChange: (p: PeriodPreset) => void;
  customRange?: DateRange;
  onCustomRangeChange: (r: DateRange | undefined) => void;
  ownerId: string;
  onOwnerChange: (v: string) => void;
  users: { id: string; full_name: string }[];
}

export function ReportFilters({
  preset,
  onPresetChange,
  customRange,
  onCustomRangeChange,
  ownerId,
  onOwnerChange,
  users,
}: Props) {
  const [open, setOpen] = useState(false);

  const formatDate = (d?: Date) =>
    d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  const customLabel =
    customRange?.from && customRange?.to
      ? `${formatDate(customRange.from)} – ${formatDate(customRange.to)}`
      : 'Selecionar datas';

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
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'h-10 justify-start gap-2 rounded-md font-normal',
                !customRange?.from && 'text-muted-foreground',
              )}
            >
              <CalendarBlank size={16} />
              {customLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={customRange}
              onSelect={(r) => {
                onCustomRangeChange(r);
                if (r?.from && r?.to) setOpen(false);
              }}
              numberOfMonths={2}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      )}

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
    </div>
  );
}
