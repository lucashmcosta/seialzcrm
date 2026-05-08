import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, WarningCircle, Clock } from '@phosphor-icons/react';
import { getTaskTypeConfig } from '@/lib/taskTypes';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { useOrganization } from '@/hooks/useOrganization';

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
  created_by_user?: { full_name: string } | null;
}

interface TasksKanbanProps {
  tasks: Task[];
  loading: boolean;
  showCompleted: boolean;
  onCardClick: (task: Task) => void;
  onComplete: (taskId: string) => void;
}

type ColumnId = 'overdue' | 'today' | 'upcoming' | 'completed';

const priorityDot = (priority: string) => {
  if (priority === 'high') return 'bg-destructive';
  if (priority === 'medium') return 'bg-amber-500';
  return 'bg-primary';
};

export function TasksKanban({ tasks, loading, showCompleted, onCardClick, onComplete }: TasksKanbanProps) {
  const { locale } = useOrganization();
  const { t } = useTranslation(locale as any);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const buckets: Record<ColumnId, Task[]> = { overdue: [], today: [], upcoming: [], completed: [] };

  for (const task of tasks) {
    if (task.status === 'completed') {
      buckets.completed.push(task);
      continue;
    }
    if (task.status !== 'open') continue;
    if (!task.due_at) {
      buckets.upcoming.push(task);
      continue;
    }
    const due = new Date(task.due_at);
    if (due < startOfToday) buckets.overdue.push(task);
    else if (due <= endOfToday) buckets.today.push(task);
    else buckets.upcoming.push(task);
  }

  const baseColumns: { id: ColumnId; label: string; accent: string }[] = [
    { id: 'overdue', label: t('tasks.columnOverdue' as any), accent: 'text-destructive' },
    { id: 'today', label: t('tasks.columnToday' as any), accent: 'text-primary' },
    { id: 'upcoming', label: t('tasks.columnUpcoming' as any), accent: 'text-foreground' },
  ];
  const columns = showCompleted
    ? [...baseColumns, { id: 'completed' as ColumnId, label: t('tasks.columnCompleted' as any), accent: 'text-muted-foreground' }]
    : baseColumns;

  return (
    <div className={cn('grid grid-cols-1 gap-4 h-full', showCompleted ? 'md:grid-cols-4' : 'md:grid-cols-3')}>
      {columns.map((col) => (
        <div
          key={col.id}
          className="flex flex-col bg-muted/30 rounded-md border border-border min-h-[400px]"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              {col.id === 'overdue' && <WarningCircle size={16} weight="bold" className="text-destructive" />}
              {col.id === 'today' && <Clock size={16} weight="bold" className="text-primary" />}
              {col.id === 'completed' && <CheckCircle size={16} weight="bold" className="text-muted-foreground" />}
              <span className={cn('text-sm font-semibold', col.accent)}>{col.label}</span>
            </div>
            <Badge variant="secondary" className="font-data text-[11px]">
              {buckets[col.id].length}
            </Badge>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {loading ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
            ) : buckets[col.id].length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">
                {t('tasks.noTasksInColumn' as any)}
              </p>
            ) : (
              buckets[col.id].map((task) => {
                const typeConfig = getTaskTypeConfig(task.task_type);
                const Icon = typeConfig.icon;
                const isCompleted = task.status === 'completed';
                const refDate = isCompleted && task.completed_at ? new Date(task.completed_at) : (task.due_at ? new Date(task.due_at) : null);
                const hasTime = refDate && (refDate.getHours() !== 0 || refDate.getMinutes() !== 0);

                return (
                  <Card
                    key={task.id}
                    onClick={() => onCardClick(task)}
                    className={cn(
                      'p-3 cursor-pointer hover:border-primary/40 transition-colors group',
                      isCompleted && 'opacity-70'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {isCompleted ? (
                        <CheckCircle size={18} weight="fill" className="mt-0.5 text-primary shrink-0" />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onComplete(task.id);
                          }}
                          className="mt-0.5 text-muted-foreground hover:text-primary transition-colors"
                          title={t('tasks.complete')}
                        >
                          <CheckCircle size={18} weight="light" />
                        </button>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={cn('w-1.5 h-1.5 rounded-full', priorityDot(task.priority))} />
                          <Icon size={13} weight="light" className="text-muted-foreground shrink-0" />
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t(typeConfig.labelKey as any)}
                          </span>
                        </div>

                        <p className={cn('text-sm font-medium text-foreground line-clamp-2', isCompleted && 'line-through')}>
                          {task.title}
                        </p>

                        {(task.contacts?.full_name || task.opportunities?.title) && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {task.contacts?.full_name || task.opportunities?.title}
                          </p>
                        )}

                        {refDate && (
                          <p className="text-[11px] font-data text-muted-foreground mt-1">
                            {refDate.toLocaleDateString(locale)}
                            {hasTime && ` · ${refDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`}
                          </p>
                        )}

                        {task.created_by_user?.full_name && task.created_by_user.full_name !== task.assigned_user?.full_name && (
                          <p className="text-[11px] text-muted-foreground mt-1 truncate">
                            {t('tasks.createdBy' as any)}: {task.created_by_user.full_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
