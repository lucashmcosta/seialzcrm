import { useState, useEffect } from 'react';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { Layout } from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, MagnifyingGlass, CheckCircle, Clock, WarningCircle, SquaresFour, List as ListIcon } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { TaskDialog } from '@/components/tasks/TaskDialog';
import { TasksKanban } from '@/components/tasks/TasksKanban';
import { CompleteTaskDialog } from '@/components/tasks/CompleteTaskDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  task_type: string;
  due_at: string | null;
  assigned_user_id: string;
  contact_id: string | null;
  opportunity_id: string | null;
  created_at: string;
  completed_at?: string | null;
  completion_notes?: string | null;
  contacts?: { full_name: string };
  opportunities?: { title: string };
  assigned_user?: { full_name: string };
  created_by_user?: { full_name: string } | null;
}

export default function TasksList() {
  const { organization, userProfile, locale } = useOrganization();
  const { user } = useAuth();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { toast } = useToast();
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = usePersistedFilters<string>('tasks.statusFilter', 'all');
  const [priorityFilter, setPriorityFilter] = usePersistedFilters<string>('tasks.priorityFilter', 'all');
  const [assignedFilter, setAssignedFilter] = usePersistedFilters<string>('tasks.assignedFilter', 'all');
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);

  // Dialogs
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editReadOnly, setEditReadOnly] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);

  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(
    () => (localStorage.getItem('tasks_view_mode') as 'list' | 'kanban') || 'kanban'
  );
  const [showCompletedKanban, setShowCompletedKanban] = useState<boolean>(
    () => localStorage.getItem('tasks_kanban_show_completed') === '1'
  );

  useEffect(() => {
    localStorage.setItem('tasks_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('tasks_kanban_show_completed', showCompletedKanban ? '1' : '0');
  }, [showCompletedKanban]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = viewMode === 'kanban' ? 500 : 20;

  useEffect(() => {
    if (organization) {
      fetchUsers();
      fetchTasks();
    }
  }, [organization, currentPage, searchTerm, statusFilter, priorityFilter, assignedFilter, viewMode, showCompletedKanban]);

  const fetchUsers = async () => {
    if (!organization) return;
    const { data } = await supabase
      .from('user_organizations')
      .select('user_id, users(id, full_name)')
      .eq('organization_id', organization.id)
      .eq('is_active', true);
    if (data) {
      const usersList = data
        .filter(u => u.users)
        .map(u => ({ id: u.users!.id, full_name: u.users!.full_name }));
      setUsers(usersList);
    }
  };

  const fetchTasks = async () => {
    if (!organization) return;
    setLoading(true);
    
    let query = supabase
      .from('tasks')
      .select(`
        *,
        contacts(full_name),
        opportunities(title),
        assigned_user:users!tasks_assigned_user_id_fkey(full_name),
        created_by_user:users!tasks_created_by_user_id_fkey(full_name)
      `, { count: 'exact' })
      .eq('organization_id', organization.id)
      .is('deleted_at', null);
    
    if (searchTerm) query = query.ilike('title', `%${searchTerm}%`);

    if (viewMode === 'kanban') {
      if (showCompletedKanban) {
        query = query.in('status', ['open', 'completed']);
      } else {
        query = query.eq('status', 'open');
      }
    } else if (statusFilter === 'overdue') {
      query = query.lt('due_at', new Date().toISOString()).eq('status', 'open');
    } else if (statusFilter === 'today') {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();
      query = query.gte('due_at', startOfDay).lte('due_at', endOfDay);
    } else if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as 'open' | 'completed' | 'canceled');
    }
    if (priorityFilter !== 'all') query = query.eq('priority', priorityFilter as 'low' | 'medium' | 'high');
    if (assignedFilter !== 'all') query = query.eq('assigned_user_id', assignedFilter);
    
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to).order('due_at', { ascending: true, nullsFirst: false });
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('Error fetching tasks:', error);
      toast({ title: t('common.error'), description: t('tasks.errorFetching'), variant: 'destructive' });
    } else {
      setTasks(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  const handleQuickComplete = async (taskId: string) => {
    // Quick-complete (from kanban "round" icon) — keep simple: marks as completed without notes
    // But per the new flow, we should open the complete dialog instead.
    const task = tasks.find((tt) => tt.id === taskId);
    if (task) openCompleteFlow(task);
  };

  const handleDeleteTask = async (taskId: string) => {
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId);
    if (error) {
      toast({ title: t('common.error'), description: t('tasks.errorDeleting'), variant: 'destructive' });
    } else {
      toast({ title: t('common.success'), description: t('tasks.deletedSuccess') });
      fetchTasks();
    }
  };

  const openTask = (task: Task) => {
    if (task.status === 'completed' || task.status === 'canceled') {
      setEditingTask(task);
      setEditReadOnly(true);
      setEditDialogOpen(true);
    } else {
      openCompleteFlow(task);
    }
  };

  const openCompleteFlow = (task: Task) => {
    setCompletingTask(task);
    setCompleteDialogOpen(true);
  };

  const openEditFlow = (task: Task | null) => {
    setEditingTask(task);
    setEditReadOnly(false);
    setEditDialogOpen(true);
  };

  const getPriorityIcon = (priority: string) => {
    if (priority === 'high') return <WarningCircle size={16} weight="light" className="text-red-600" />;
    if (priority === 'medium') return <Clock size={16} weight="light" className="text-yellow-600" />;
    return <Clock size={16} weight="light" className="text-blue-600" />;
  };

  const isOverdue = (task: Task) => {
    if (!task.due_at || task.status !== 'open') return false;
    return new Date(task.due_at) < new Date();
  };

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between px-6 py-4">
            <h1 className="text-2xl font-bold text-foreground">{t('tasks.title')}</h1>
            <div className="flex items-center gap-3">
              {viewMode === 'kanban' && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-completed"
                    checked={showCompletedKanban}
                    onCheckedChange={setShowCompletedKanban}
                  />
                  <Label htmlFor="show-completed" className="text-sm text-muted-foreground cursor-pointer">
                    {t('tasks.showCompleted' as any)}
                  </Label>
                </div>
              )}
              <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors',
                    viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <ListIcon size={16} weight={viewMode === 'list' ? 'bold' : 'light'} />
                  <span className="hidden sm:inline">{t('tasks.viewList' as any)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors',
                    viewMode === 'kanban' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <SquaresFour size={16} weight={viewMode === 'kanban' ? 'bold' : 'light'} />
                  <span className="hidden sm:inline">{t('tasks.viewKanban' as any)}</span>
                </button>
              </div>
              <Button onClick={() => openEditFlow(null)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('tasks.newTask')}
              </Button>
            </div>
          </div>
          
          <div className="px-6 pb-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <MagnifyingGlass size={16} weight="light" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('tasks.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder={t('tasks.priority')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tasks.allPriorities')}</SelectItem>
                <SelectItem value="high">{t('tasks.highPriority')}</SelectItem>
                <SelectItem value="medium">{t('tasks.mediumPriority')}</SelectItem>
                <SelectItem value="low">{t('tasks.lowPriority')}</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder={t('tasks.assignedTo')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tasks.allUsers')}</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {viewMode === 'kanban' ? (
            <TasksKanban
              tasks={tasks as any}
              loading={loading}
              showCompleted={showCompletedKanban}
              onCardClick={(task) => openTask(task as any)}
              onComplete={handleQuickComplete}
            />
          ) : (
          <Tabs defaultValue="all" onValueChange={(value) => setStatusFilter(value)}>
            <TabsList>
              <TabsTrigger value="all">{t('tasks.allTasks')}</TabsTrigger>
              <TabsTrigger value="overdue">{t('tasks.overdue')}</TabsTrigger>
              <TabsTrigger value="today">{t('tasks.today')}</TabsTrigger>
              <TabsTrigger value="open">{t('tasks.open')}</TabsTrigger>
              <TabsTrigger value="completed">{t('tasks.completed')}</TabsTrigger>
            </TabsList>
            
            <TabsContent value={statusFilter} className="mt-6">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                      <Skeleton className="h-3 w-32" />
                    </div>
                  ))}
                </div>
              ) : tasks.length === 0 ? (
                <Card className="p-6"><p className="text-muted-foreground text-center">{t('tasks.noTasks')}</p></Card>
              ) : (
                <>
                  <div className="grid gap-4">
                    {tasks.map(task => {
                      const completed = task.status === 'completed' || task.status === 'canceled';
                      return (
                      <Card
                        key={task.id}
                        className={cn(
                          'p-4 cursor-pointer hover:border-primary/40 transition-colors',
                          isOverdue(task) && 'border-red-500',
                          completed && 'opacity-80'
                        )}
                        onClick={() => openTask(task)}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {completed
                                ? <CheckCircle size={16} weight="fill" className="text-primary" />
                                : getPriorityIcon(task.priority)}
                              <h3 className={cn('font-semibold', completed && 'line-through text-muted-foreground')}>{task.title}</h3>
                              {isOverdue(task) && (
                                <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                                  {t('tasks.overdue')}
                                </span>
                              )}
                            </div>
                            
                            {task.description && (
                              <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                            )}
                            
                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                              {task.assigned_user && <span>{t('tasks.assignedTo')}: {task.assigned_user.full_name}</span>}
                              {task.created_by_user?.full_name && task.created_by_user.full_name !== task.assigned_user?.full_name && (
                                <span>{t('tasks.createdBy' as any)}: {task.created_by_user.full_name}</span>
                              )}
                              {task.contacts && <span>{t('tasks.contact')}: {task.contacts.full_name}</span>}
                              {task.opportunities && <span>{t('tasks.opportunity')}: {task.opportunities.title}</span>}
                              {task.due_at && (
                                <span>{t('tasks.dueDate')}: {new Date(task.due_at).toLocaleDateString(locale)}</span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            {completed ? (
                              <Button size="sm" variant="outline" onClick={() => { setEditingTask(task); setEditReadOnly(true); setEditDialogOpen(true); }}>
                                {t('tasks.viewDetails' as any)}
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" onClick={() => openCompleteFlow(task)}>
                                  <CheckCircle size={16} weight="light" className="mr-1" />
                                  {t('tasks.complete')}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => openEditFlow(task)}>
                                  {t('common.edit')}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => handleDeleteTask(task.id)}>
                                  {t('common.delete')}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </Card>
                      );
                    })}
                  </div>
                  
                  {totalCount > pageSize && (
                    <div className="mt-6 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        {t('common.showing')} {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalCount)} {t('common.of')} {totalCount}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                          {t('common.previous')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / pageSize), p + 1))} disabled={currentPage >= Math.ceil(totalCount / pageSize)}>
                          {t('common.next')}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
          )}
        </div>
      </div>

      <TaskDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        task={editingTask}
        readOnly={editReadOnly}
        onSuccess={fetchTasks}
      />

      <CompleteTaskDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        task={completingTask as any}
        onSuccess={fetchTasks}
        onRequestEdit={(task) => openEditFlow(task as any)}
      />
    </Layout>
  );
}
