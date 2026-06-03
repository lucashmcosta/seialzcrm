import { formatDateSeparator } from '@/lib/dateSeparator';

interface Props {
  date: Date;
}

export function DateSeparator({ date }: Props) {
  return (
    <div className="flex justify-center my-3">
      <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-[11px] font-medium shadow-sm">
        {formatDateSeparator(date)}
      </span>
    </div>
  );
}
