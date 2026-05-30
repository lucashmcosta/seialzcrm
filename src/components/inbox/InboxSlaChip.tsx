import { cn } from '@/lib/utils';

interface Props {
  targetAt: string | null;
  firstResponseAt: string | null;
  className?: string;
}

function format(diffMs: number) {
  const abs = Math.abs(diffMs);
  const mins = Math.floor(abs / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function InboxSlaChip({ targetAt, firstResponseAt, className }: Props) {
  if (!targetAt) return null;
  if (firstResponseAt) {
    return (
      <span className={cn('inline-flex items-center gap-1 font-data text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground', className)}>
        SLA OK
      </span>
    );
  }
  const target = new Date(targetAt).getTime();
  const now = Date.now();
  const diff = target - now;
  const overdue = diff < 0;
  const warning = !overdue && diff < 30 * 60 * 1000;
  const tone = overdue
    ? 'bg-destructive/15 text-destructive'
    : warning
      ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  return (
    <span className={cn('inline-flex items-center gap-1 font-data text-[10px] px-1.5 py-0.5 rounded', tone, className)}>
      {overdue ? `−${format(diff)}` : format(diff)}
    </span>
  );
}
