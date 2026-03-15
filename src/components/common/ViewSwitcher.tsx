import React from 'react';
import { SquaresFour, List, Columns } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * ViewSwitcher Component
 * Toggle between different view modes (Grid, List, Kanban).
 */

type ViewMode = 'grid' | 'list' | 'kanban';

interface ViewSwitcherProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  views?: ViewMode[];
  className?: string;
}

const viewIcons: Record<ViewMode, React.ElementType> = {
  grid: SquaresFour,
  list: List,
  kanban: Columns,
};

const viewLabels: Record<ViewMode, string> = {
  grid: 'Grade',
  list: 'Lista',
  kanban: 'Kanban',
};

export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({
  view,
  onViewChange,
  views = ['grid', 'list'],
  className,
}) => {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full bg-muted p-1',
        className
      )}
    >
      {views.map((v) => {
        const Icon = viewIcons[v];
        return (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={cn(
              'rounded-full p-2 transition-all',
              view === v
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title={viewLabels[v]}
          >
            <Icon size={16} weight={view === v ? "bold" : "light"} />
          </button>
        );
      })}
    </div>
  );
};
