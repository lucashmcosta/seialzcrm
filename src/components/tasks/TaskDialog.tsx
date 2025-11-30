import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface Contact {
  id: string;
  full_name: string;
}

interface Opportunity {
  id: string;
  title: string;
}

interface User {
  id: string;
  full_name: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  task_type: string | null;
  priority: string | null;
  status: string | null;
  due_at: string | null;
  assigned_user_id: string;
  contact_id: string | null;
  opportunity_id: string | null;
}

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  onSuccess: () => void;
}

export function TaskDialog({ open, onOpenChange, task, onSuccess }: TaskDialogProps) {
  const { organization, userProfile } = useOrganization();
  const { locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const [submitting, setSubmitting] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    task_type: 'general',
    priority: 'medium',
    due_at: '',
    assigned_user_id: '',
    contact_id: '',
    opportunity_id: '',
  });

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description || '',
        task_type: task.task_type || 'general',
        priority: task.priority || 'medium',
        due_at: task.due_at ? task.due_at.split('T')[0] : '',
        assigned_user_id: task.assigned_user_id,
        contact_id: task.contact_id || '',
        opportunity_id: task.opportunity_id || '',
      });
    } else {
      setFormData({
        title: '',
        description: '',
        task_type: 'general',
        priority: 'medium',
        due_at: '',
        assigned_user_id: userProfile?.id || '',
        contact_id: '',
        opportunity_id: '',
      });
    }
  }, [task, userProfile]);

  useEffect(() => {
    if (open && organization) {
      fetchData();
    }
  }, [open, organization]);

  const fetchData = async () => {
    if (!organization) return;

    const [contactsRes, oppsRes, usersRes] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, full_name')
        .eq('organization_id', organization.id)
        .is('deleted_at', null)
        .order('full_name'),
      supabase
        .from('opportunities')
        .select('id, title')
        .eq('organization_id', organization.id)
        .is('deleted_at', null)
        .order('title'),
      supabase
        .from('user_organizations')
        .select('user_id, users(id, full_name)')
        .eq('organization_id', organization.id)
        .eq('is_active', true),
    ]);

    if (contactsRes.data) setContacts(contactsRes.data);
    if (oppsRes.data) setOpportunities(oppsRes.data);
    if (usersRes.data) {
      setUsers(usersRes.data.map((uo: any) => uo.users).filter(Boolean));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !formData.assigned_user_id) return;

    setSubmitting(true);
    try {
      const taskData = {
        title: formData.title,
        description: formData.description || null,
        task_type: formData.task_type as 'general' | 'call' | 'message',
        priority: formData.priority as 'low' | 'medium' | 'high',
        due_at: formData.due_at ? new Date(formData.due_at).toISOString() : null,
        assigned_user_id: formData.assigned_user_id,
        contact_id: formData.contact_id || null,
        opportunity_id: formData.opportunity_id || null,
        organization_id: organization.id,
        created_by_user_id: userProfile?.id,
        status: (task?.status as 'open' | 'completed' | 'canceled') || 'open',
      };

      if (task) {
        const { error } = await supabase
          .from('tasks')
          .update(taskData)
          .eq('id', task.id);
        
        if (error) throw error;
        toast({ title: t('tasks.updated') });
      } else {
        const { error } = await supabase
          .from('tasks')
          .insert([taskData]);
        
        if (error) throw error;
        toast({ title: t('tasks.created') });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving task:', error);
      toast({
        title: t('common.error'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? t('tasks.editTask') : t('tasks.newTask')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">{t('opportunities.name')}</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="description">{t('tasks.description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="task_type">{t('tasks.type')}</Label>
              <Select value={formData.task_type} onValueChange={(v) => setFormData({ ...formData, task_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">{t('tasks.typeGeneral')}</SelectItem>
                  <SelectItem value="call">{t('tasks.typeCall')}</SelectItem>
                  <SelectItem value="message">{t('tasks.typeMessage')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="priority">{t('tasks.priority')}</Label>
              <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                <SelectTrigger>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="due_at">{t('tasks.dueDate')}</Label>
              <Input
                id="due_at"
                type="date"
                value={formData.due_at}
                onChange={(e) => setFormData({ ...formData, due_at: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="assigned_user_id">{t('tasks.assignedTo')}</Label>
              <Select value={formData.assigned_user_id} onValueChange={(v) => setFormData({ ...formData, assigned_user_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contact_id">{t('opportunities.contact')} ({t('common.none')})</Label>
              <Select value={formData.contact_id} onValueChange={(v) => setFormData({ ...formData, contact_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('common.none')}</SelectItem>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="opportunity_id">{t('opportunities.title')} ({t('common.none')})</Label>
              <Select value={formData.opportunity_id} onValueChange={(v) => setFormData({ ...formData, opportunity_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('common.none')}</SelectItem>
                  {opportunities.map((opp) => (
                    <SelectItem key={opp.id} value={opp.id}>
                      {opp.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
