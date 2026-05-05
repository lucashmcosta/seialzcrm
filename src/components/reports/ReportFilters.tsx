import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface PeriodOption {
  value: string;
  label: string;
}

export const PERIOD_OPTIONS: PeriodOption[] = [
  { value: '1', label: 'Hoje' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '365', label: 'Últimos 12 meses' },
];

interface Props {
  period: string;
  onPeriodChange: (v: string) => void;
  ownerId: string;
  onOwnerChange: (v: string) => void;
  users: { id: string; full_name: string }[];
}

export function ReportFilters({
  period,
  onPeriodChange,
  ownerId,
  onOwnerChange,
  users,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={period} onValueChange={onPeriodChange}>
        <SelectTrigger className="w-52 rounded-md">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
