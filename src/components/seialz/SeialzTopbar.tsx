import { ReactNode } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';

interface SeialzTopbarProps {
  title: string;
  count?: string;
  children?: ReactNode;
}

export function SeialzTopbar({ title, count, children }: SeialzTopbarProps) {
  return (
    <div className="h-14 border-b border-border flex items-center px-6 gap-4 flex-shrink-0">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      {count && (
        <span className="font-data text-[11px] text-[hsl(var(--sz-t3))] bg-[hsl(var(--sz-bg3))] px-2 py-0.5 rounded">
          {count}
        </span>
      )}
      <div className="flex-1" />
      {children}
    </div>
  );
}
