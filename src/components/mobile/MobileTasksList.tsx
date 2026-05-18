import { Plus, MagnifyingGlass, CheckCircle, WarningCircle, Clock } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { MobileSpinner } from '@/components/mobile/MobileSpinner';
import { getTaskTypeConfig } from '@/lib/taskTypes';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  task_type: string;
  due_at: string | null;
  completed_at?: string | null;
  contacts?: { full_name: string } | null;
  opportunities?: { title: string } | null;
  assigned_user?: { full_name: string } | null;
}

interface MobileTasksListProps {
  tasks: Task[];
  loading: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  onTaskClick: (task: Task) => void;
  onComplete: (task: Task) => void;
  onCreate: () => void;
  locale: string;
}

const statusChips = [
  { value: 'all', label: 'Todas' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'today', label: 'Hoje' },
  { value: 'open', label: 'Abertas' },
  { value: 'completed', label: 'Concluídas' },
];

const priorityDot = (p: string) =>
  p === 'high' ? 'bg-destructive' : p === 'medium' ? 'bg-amber-500' : 'bg-primary';

export function MobileTasksList({
  tasks,
  loading,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onTaskClick,
  onComplete,
  onCreate,
  locale,
}: MobileTasksListProps) {
  const isOverdue = (t: Task) =>
    t.status === 'open' && t.due_at && new Date(t.due_at) < new Date();

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <MagnifyingGlass
            size={16}
            weight="light"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar tarefas..."
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Status filter chips */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
        {statusChips.map((chip) => (
          <button
            key={chip.value}
            onClick={() => onStatusFilterChange(chip.value)}
            className={cn(
              'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
              statusFilter === chip.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto px-4 py-2 space-y-2 scrollbar-hide">
        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <MobileSpinner />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada</p>
          </div>
        ) : (
          tasks.map((task) => {
            const typeCfg = getTaskTypeConfig(task.task_type);
            const Icon = typeCfg.icon;
            const completed = task.status === 'completed' || task.status === 'canceled';
            const overdue = isOverdue(task);
            const refDate =
              completed && task.completed_at
                ? new Date(task.completed_at)
                : task.due_at
                ? new Date(task.due_at)
                : null;
            const hasTime =
              refDate && (refDate.getHours() !== 0 || refDate.getMinutes() !== 0);

            return (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                className={cn(
                  'w-full text-left bg-card border border-border rounded-md p-3 flex items-start gap-3 active:bg-muted/50 transition-colors',
                  overdue && 'border-destructive/60',
                  completed && 'opacity-70'
                )}
              >
                {completed ? (
                  <CheckCircle size={20} weight="fill" className="mt-0.5 text-primary shrink-0" />
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onComplete(task);
                    }}
                    className="mt-0.5 text-muted-foreground active:text-primary shrink-0"
                    aria-label="Concluir"
                  >
                    <CheckCircle size={20} weight="light" />
                  </button>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', priorityDot(task.priority))} />
                    <Icon size={12} weight="light" className="text-muted-foreground shrink-0" />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                      {typeCfg.id}
                    </span>
                    {overdue && (
                      <span className="ml-auto flex items-center gap-1 text-[10px] text-destructive">
                        <WarningCircle size={12} weight="bold" />
                        Atrasada
                      </span>
                    )}
                  </div>

                  <p
                    className={cn(
                      'text-sm font-medium text-foreground line-clamp-2',
                      completed && 'line-through'
                    )}
                  >
                    {task.title}
                  </p>

                  {(task.contacts?.full_name || task.opportunities?.title) && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {task.contacts?.full_name || task.opportunities?.title}
                    </p>
                  )}

                  {refDate && (
                    <p className="text-[11px] font-data text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock size={11} weight="light" />
                      {refDate.toLocaleDateString(locale)}
                      {hasTime &&
                        ` · ${refDate.toLocaleTimeString(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button
        onClick={onCreate}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Nova tarefa"
      >
        <Plus size={24} weight="bold" />
      </button>
    </div>
  );
}
