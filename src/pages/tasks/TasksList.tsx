import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { TaskDialog } from '@/components/tasks/TaskDialog';
import { useToast } from '@/hooks/use-toast';

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
  contacts?: { full_name: string };
  opportunities?: { title: string };
  assigned_user?: { full_name: string };
}

export default function TasksList() {
  const { organization, userProfile, locale } = useOrganization();
  const { user } = useAuth();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { toast } = useToast();
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [assignedFilter, setAssignedFilter] = useState('all');
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    if (organization) {
      fetchUsers();
      fetchTasks();
    }
  }, [organization, currentPage, searchTerm, statusFilter, priorityFilter, assignedFilter]);

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
        assigned_user:users!tasks_assigned_user_id_fkey(full_name)
      `, { count: 'exact' })
      .eq('organization_id', organization.id)
      .is('deleted_at', null);
    
    // Apply filters
    if (searchTerm) {
      query = query.ilike('title', `%${searchTerm}%`);
    }
    if (statusFilter === 'overdue') {
      query = query.lt('due_at', new Date().toISOString()).eq('status', 'open');
    } else if (statusFilter === 'today') {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();
      query = query.gte('due_at', startOfDay).lte('due_at', endOfDay);
    } else if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as 'open' | 'completed' | 'canceled');
    }
    if (priorityFilter !== 'all') {
      query = query.eq('priority', priorityFilter as 'low' | 'medium' | 'high');
    }
    if (assignedFilter !== 'all') {
      query = query.eq('assigned_user_id', assignedFilter);
    }
    
    // Apply pagination
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to).order('due_at', { ascending: true, nullsFirst: false });
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('Error fetching tasks:', error);
      toast({
        title: t('common.error'),
        description: t('tasks.errorFetching'),
        variant: 'destructive',
      });
    } else {
      setTasks(data || []);
      setTotalCount(count || 0);
    }
    
    setLoading(false);
  };

  const handleCompleteTask = async (taskId: string) => {
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);
    
    if (error) {
      console.error('Error completing task:', error);
      toast({
        title: t('common.error'),
        description: t('tasks.errorCompleting'),
        variant: 'destructive',
      });
    } else {
      toast({
        title: t('common.success'),
        description: t('tasks.completedSuccess'),
      });
      fetchTasks();
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId);
    
    if (error) {
      console.error('Error deleting task:', error);
      toast({
        title: t('common.error'),
        description: t('tasks.errorDeleting'),
        variant: 'destructive',
      });
    } else {
      toast({
        title: t('common.success'),
        description: t('tasks.deletedSuccess'),
      });
      fetchTasks();
    }
  };

  const getPriorityIcon = (priority: string) => {
    if (priority === 'high') return <AlertCircle className="w-4 h-4 text-red-600" />;
    if (priority === 'medium') return <Clock className="w-4 h-4 text-yellow-600" />;
    return <Clock className="w-4 h-4 text-blue-600" />;
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
            <Button onClick={() => { setSelectedTask(null); setIsDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t('tasks.newTask')}
            </Button>
          </div>
          
          {/* Filters */}
          <div className="px-6 pb-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('tasks.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('tasks.priority')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tasks.allPriorities')}</SelectItem>
                <SelectItem value="high">{t('tasks.highPriority')}</SelectItem>
                <SelectItem value="medium">{t('tasks.mediumPriority')}</SelectItem>
                <SelectItem value="low">{t('tasks.lowPriority')}</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t('tasks.assignedTo')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tasks.allUsers')}</SelectItem>
                {users.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
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
                <p className="text-muted-foreground">{t('common.loading')}</p>
              ) : tasks.length === 0 ? (
                <Card className="p-6">
                  <p className="text-muted-foreground text-center">{t('tasks.noTasks')}</p>
                </Card>
              ) : (
                <>
                  <div className="grid gap-4">
                    {tasks.map(task => (
                      <Card
                        key={task.id}
                        className={`p-4 ${isOverdue(task) ? 'border-red-500' : ''}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {getPriorityIcon(task.priority)}
                              <h3 className="font-semibold">{task.title}</h3>
                              {isOverdue(task) && (
                                <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                                  {t('tasks.overdue')}
                                </span>
                              )}
                            </div>
                            
                            {task.description && (
                              <p className="text-sm text-muted-foreground mb-2">
                                {task.description}
                              </p>
                            )}
                            
                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                              {task.assigned_user && (
                                <span>{t('tasks.assignedTo')}: {task.assigned_user.full_name}</span>
                              )}
                              {task.contacts && (
                                <span>{t('tasks.contact')}: {task.contacts.full_name}</span>
                              )}
                              {task.opportunities && (
                                <span>{t('tasks.opportunity')}: {task.opportunities.title}</span>
                              )}
                              {task.due_at && (
                                <span>
                                  {t('tasks.dueDate')}: {new Date(task.due_at).toLocaleDateString(locale)}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            {task.status === 'open' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCompleteTask(task.id)}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                {t('tasks.complete')}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setSelectedTask(task); setIsDialogOpen(true); }}
                            >
                              {t('common.edit')}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteTask(task.id)}
                            >
                              {t('common.delete')}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                  
                  {/* Pagination */}
                  {totalCount > pageSize && (
                    <div className="mt-6 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        {t('common.showing')} {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalCount)} {t('common.of')} {totalCount}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          {t('common.previous')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                          disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                        >
                          {t('common.next')}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <TaskDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        task={selectedTask}
        onSuccess={fetchTasks}
      />
    </Layout>
  );
}
