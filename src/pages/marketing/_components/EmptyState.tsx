import { ReactNode } from 'react';
import { Megaphone } from '@phosphor-icons/react';

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        {icon || <Megaphone size={20} weight="light" />}
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
