import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';
import { SpinnerGap, CaretDown, X } from '@phosphor-icons/react';
import { TASK_TYPES } from '@/lib/taskTypes';
import { cn } from '@/lib/utils';

interface Contact { id: string; full_name: string; }
interface Opportunity { id: string; title: string; contact_id: string | null; }
interface User { id: string; full_name: string; }

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
  completion_notes?: string | null;
  completed_at?: string | null;
}

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  onSuccess: () => void;
  readOnly?: boolean;
}

interface ComboboxProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  noneLabel?: string;
}

function Combobox({ value, onChange, options, placeholder, searchPlaceholder, emptyText, disabled, noneLabel }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          <CaretDown size={14} weight="light" className="ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {noneLabel && (
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <span className="text-muted-foreground italic">{noneLabel}</span>
              </CommandItem>
            )}
            {options.map((opt) => (
              <CommandItem
                key={opt.value}
                value={`${opt.label} ${opt.value}`}
                onSelect={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function TaskDialog({ open, onOpenChange, task, onSuccess, readOnly = false }: TaskDialogProps) {
  const { organization, userProfile, locale } = useOrganization();
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
  }, [task, userProfile, open]);

  useEffect(() => {
    if (open && organization) fetchData();
  }, [open, organization]);

  const fetchData = async () => {
    if (!organization) return;
    const [contactsRes, oppsRes, usersRes] = await Promise.all([
      supabase.from('contacts').select('id, full_name').eq('organization_id', organization.id).is('deleted_at', null).order('full_name').limit(2000),
      supabase.from('opportunities').select('id, title, contact_id').eq('organization_id', organization.id).is('deleted_at', null).order('title').limit(2000),
      supabase.from('user_organizations').select('user_id, users(id, full_name)').eq('organization_id', organization.id).eq('is_active', true),
    ]);
    if (contactsRes.data) setContacts(contactsRes.data);
    if (oppsRes.data) setOpportunities(oppsRes.data as Opportunity[]);
    if (usersRes.data) setUsers(usersRes.data.map((uo: any) => uo.users).filter(Boolean));
  };

  // Filtered options based on cross-relation
  const selectedContact = contacts.find((c) => c.id === formData.contact_id);
  const filteredOpportunities = useMemo(() => {
    if (!formData.contact_id) return opportunities;
    return opportunities.filter((o) => o.contact_id === formData.contact_id);
  }, [opportunities, formData.contact_id]);

  const filteredContacts = useMemo(() => {
    if (!formData.opportunity_id) return contacts;
    const opp = opportunities.find((o) => o.id === formData.opportunity_id);
    if (!opp || !opp.contact_id) return contacts;
    return contacts.filter((c) => c.id === opp.contact_id);
  }, [contacts, opportunities, formData.opportunity_id]);

  const handleContactChange = (v: string) => {
    setFormData((prev) => {
      const next = { ...prev, contact_id: v };
      // If current opportunity doesn't belong to this contact, clear it
      if (v && prev.opportunity_id) {
        const opp = opportunities.find((o) => o.id === prev.opportunity_id);
        if (opp && opp.contact_id !== v) next.opportunity_id = '';
      }
      return next;
    });
  };

  const handleOpportunityChange = (v: string) => {
    setFormData((prev) => {
      const next = { ...prev, opportunity_id: v };
      // Auto-fill contact from opportunity if empty
      if (v && !prev.contact_id) {
        const opp = opportunities.find((o) => o.id === v);
        if (opp?.contact_id) next.contact_id = opp.contact_id;
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!organization || !formData.assigned_user_id) return;

    setSubmitting(true);
    try {
      const taskData = {
        title: formData.title,
        description: formData.description || null,
        task_type: formData.task_type as any,
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
        const { error } = await supabase.from('tasks').update(taskData).eq('id', task.id);
        if (error) throw error;
        toast({ title: t('tasks.updated') });
      } else {
        const { error } = await supabase.from('tasks').insert([taskData]);
        if (error) throw error;
        toast({ title: t('tasks.created') });
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving task:', error);
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const titleText = readOnly ? t('tasks.viewDetails' as any) : (task ? t('tasks.editTask') : t('tasks.newTask'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={readOnly} className="space-y-4">
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

            {readOnly && task?.completion_notes && (
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('tasks.completionNotes' as any)}
                </Label>
                <p className="text-sm text-foreground whitespace-pre-wrap mt-1">{task.completion_notes}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task_type">{t('tasks.type')}</Label>
                <Select value={formData.task_type} onValueChange={(v) => setFormData({ ...formData, task_type: v })} disabled={readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map((tt) => (
                      <SelectItem key={tt.id} value={tt.id}>{t(tt.labelKey as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="priority">{t('tasks.priority')}</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })} disabled={readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label>{t('tasks.assignedTo')}</Label>
                <Combobox
                  value={formData.assigned_user_id}
                  onChange={(v) => setFormData({ ...formData, assigned_user_id: v })}
                  options={users.map((u) => ({ value: u.id, label: u.full_name }))}
                  placeholder={t('common.select')}
                  searchPlaceholder={t('tasks.searchPlaceholderGeneric' as any)}
                  emptyText={t('tasks.noResults' as any)}
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('tasks.contact')}</Label>
                <Combobox
                  value={formData.contact_id}
                  onChange={handleContactChange}
                  options={filteredContacts.map((c) => ({ value: c.id, label: c.full_name }))}
                  placeholder={t('common.none')}
                  searchPlaceholder={t('tasks.searchPlaceholderGeneric' as any)}
                  emptyText={t('tasks.noResults' as any)}
                  noneLabel={t('common.none')}
                  disabled={readOnly}
                />
              </div>

              <div>
                <Label>{t('tasks.opportunity')}</Label>
                <Combobox
                  value={formData.opportunity_id}
                  onChange={handleOpportunityChange}
                  options={filteredOpportunities.map((o) => ({ value: o.id, label: o.title }))}
                  placeholder={t('common.none')}
                  searchPlaceholder={t('tasks.searchPlaceholderGeneric' as any)}
                  emptyText={t('tasks.noResults' as any)}
                  noneLabel={t('common.none')}
                  disabled={readOnly}
                />
                {selectedContact && !readOnly && (
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <span>{t('tasks.filterByContact' as any)} <strong>{selectedContact.full_name}</strong></span>
                    <button type="button" onClick={() => handleContactChange('')} className="hover:text-foreground inline-flex items-center">
                      · <X size={10} className="mx-0.5" />{t('tasks.clearFilter' as any)}
                    </button>
                  </p>
                )}
              </div>
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? t('common.close' as any) || 'Fechar' : t('common.cancel')}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={submitting}>
                {submitting && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.save')}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
