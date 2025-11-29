import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, CheckCircle2, Circle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'completed' | 'canceled';
  priority: 'low' | 'medium' | 'high';
  due_at: string | null;
  task_type: string;
  created_at: string;
}

interface ContactTasksProps {
  contactId: string;
}

export function ContactTasks({ contactId }: ContactTasksProps) {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    task_type: 'general',
    priority: 'medium' as 'low' | 'medium' | 'high',
    due_at: '',
  });

  useEffect(() => {
    fetchTasks();
  }, [contactId, organization?.id]);

  const fetchTasks = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('contact_id', contactId)
        .is('deleted_at', null)
        .order('due_at', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !userProfile?.id) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .insert({
          organization_id: organization.id,
          contact_id: contactId,
          assigned_user_id: userProfile.id,
          created_by_user_id: userProfile.id,
          ...formData,
          due_at: formData.due_at || null,
        });

      if (error) throw error;

      toast({ description: t('tasks.created') });
      setDialogOpen(false);
      setFormData({ title: '', description: '', task_type: 'general', priority: 'medium', due_at: '' });
      fetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTaskStatus = async (taskId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'open' ? 'completed' : 'open';
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', taskId);

      if (error) throw error;
      fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-muted';
    }
  };

  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('contacts.tasksTab')}</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                {t('tasks.newTask')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{t('tasks.newTask')}</DialogTitle>
                  <DialogDescription>Create a new task for this contact</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">{t('tasks.title')}</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">{t('tasks.description')}</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="type">{t('tasks.type')}</Label>
                      <Select value={formData.task_type} onValueChange={(value) => setFormData({ ...formData, task_type: value })}>
                        <SelectTrigger id="type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">{t('tasks.typeGeneral')}</SelectItem>
                          <SelectItem value="call">{t('tasks.typeCall')}</SelectItem>
                          <SelectItem value="message">{t('tasks.typeMessage')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="priority">{t('tasks.priority')}</Label>
                      <Select value={formData.priority} onValueChange={(value: any) => setFormData({ ...formData, priority: value })}>
                        <SelectTrigger id="priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">{t('tasks.priorityLow')}</SelectItem>
                          <SelectItem value="medium">{t('tasks.priorityMedium')}</SelectItem>
                          <SelectItem value="high">{t('tasks.priorityHigh')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due_at">{t('tasks.dueDate')}</Label>
                    <Input
                      id="due_at"
                      type="datetime-local"
                      value={formData.due_at}
                      onChange={(e) => setFormData({ ...formData, due_at: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('common.save')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No tasks yet</p>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <button
                  onClick={() => toggleTaskStatus(task.id, task.status)}
                  className="flex-shrink-0 mt-1"
                >
                  {task.status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {task.title}
                    </p>
                    <Badge className={`${getPriorityColor(task.priority)} text-white text-xs`}>
                      {t(`tasks.priority${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`)}
                    </Badge>
                  </div>
                  {task.description && (
                    <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                  )}
                  {task.due_at && (
                    <p className="text-xs text-muted-foreground">
                      Due {formatDistanceToNow(new Date(task.due_at), { addSuffix: true, locale: dateLocale })}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
