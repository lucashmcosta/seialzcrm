import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { CheckCircle, Clock, PencilSimple, Trash, SpinnerGap } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  due_at: string | null;
  contacts?: { full_name: string } | null;
  opportunities?: { title: string } | null;
  assigned_user?: { full_name: string } | null;
  created_by_user?: { full_name: string } | null;
}

interface CompleteTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  onSuccess: () => void;
  onRequestEdit: (task: Task) => void;
}

type Mode = 'complete' | 'postpone';

export function CompleteTaskDialog({ open, onOpenChange, task, onSuccess, onRequestEdit }: CompleteTaskDialogProps) {
  const { locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<Mode>('complete');
  const [submitting, setSubmitting] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [newDueAt, setNewDueAt] = useState('');
  const [postponeReason, setPostponeReason] = useState('');

  useEffect(() => {
    if (open && task) {
      setMode('complete');
      setCompletionNotes('');
      setNewDueAt(task.due_at ? task.due_at.slice(0, 16) : '');
      setPostponeReason('');
    }
  }, [open, task]);

  if (!task) return null;

  const handleComplete = async () => {
    if (!completionNotes.trim()) {
      toast({ title: t('tasks.completionNotesRequired' as any), variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completion_notes: completionNotes.trim(),
      })
      .eq('id', task.id);
    setSubmitting(false);
    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: t('tasks.completedSuccess') });
    onSuccess();
    onOpenChange(false);
  };

  const handlePostpone = async () => {
    if (!newDueAt) {
      toast({ title: t('tasks.newDueDate' as any), variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from('tasks')
      .update({
        due_at: new Date(newDueAt).toISOString(),
        postpone_reason: postponeReason.trim() || null,
      })
      .eq('id', task.id);
    setSubmitting(false);
    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: t('common.success') });
    onSuccess();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    setSubmitting(true);
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', task.id);
    setSubmitting(false);
    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: t('tasks.deletedSuccess') });
    onSuccess();
    onOpenChange(false);
  };

  const meta = (
    <div className="space-y-2 text-sm text-muted-foreground border-l-2 border-border pl-3">
      {task.description && <p className="text-foreground whitespace-pre-wrap">{task.description}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {task.contacts?.full_name && <span>{t('tasks.contact')}: {task.contacts.full_name}</span>}
        {task.opportunities?.title && <span>{t('tasks.opportunity')}: {task.opportunities.title}</span>}
        {task.due_at && <span>{t('tasks.dueDate')}: {new Date(task.due_at).toLocaleString(locale)}</span>}
        {task.assigned_user?.full_name && <span>{t('tasks.assignedTo')}: {task.assigned_user.full_name}</span>}
        {task.created_by_user?.full_name && task.created_by_user.full_name !== task.assigned_user?.full_name && (
          <span>{t('tasks.createdBy' as any)}: {task.created_by_user.full_name}</span>
        )}
      </div>
    </div>
  );

  const tabs = (
    <div className={cn(
      'inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5',
      isMobile ? 'w-full' : 'self-start'
    )}>
      <button
        type="button"
        onClick={() => setMode('complete')}
        className={cn(
          'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors',
          isMobile && 'flex-1',
          mode === 'complete' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <CheckCircle size={16} weight={mode === 'complete' ? 'bold' : 'light'} />
        {t('tasks.completeTask' as any)}
      </button>
      <button
        type="button"
        onClick={() => setMode('postpone')}
        className={cn(
          'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors',
          isMobile && 'flex-1',
          mode === 'postpone' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Clock size={16} weight={mode === 'postpone' ? 'bold' : 'light'} />
        {t('tasks.postpone' as any)}
      </button>
    </div>
  );

  const fields = (
    <>
      {mode === 'complete' && (
        <div className="space-y-2">
          <Label htmlFor="completion_notes">
            {t('tasks.completionNotes' as any)} <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="completion_notes"
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            placeholder={t('tasks.completionNotesRequired' as any)}
            rows={4}
            autoFocus
          />
        </div>
      )}

      {mode === 'postpone' && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="new_due_at">{t('tasks.newDueDate' as any)}</Label>
            <Input
              id="new_due_at"
              type="datetime-local"
              value={newDueAt}
              onChange={(e) => setNewDueAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="postpone_reason">{t('tasks.postponeReason' as any)}</Label>
            <Textarea
              id="postpone_reason"
              value={postponeReason}
              onChange={(e) => setPostponeReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>
      )}
    </>
  );

  const editBtn = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        onOpenChange(false);
        onRequestEdit(task);
      }}
    >
      <PencilSimple size={14} weight="light" className="mr-1" />
      {t('common.edit')}
    </Button>
  );

  const deleteBtn = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Trash size={14} weight="light" className="mr-1" />
          {t('common.delete')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
          <AlertDialogDescription>{t('tasks.deleteConfirm')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>{t('common.delete')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] overflow-y-auto p-4 space-y-4">
          <SheetHeader className="text-left">
            <SheetTitle className="text-lg font-semibold pr-6">{task.title}</SheetTitle>
          </SheetHeader>
          {meta}
          {tabs}
          {fields}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              {editBtn}
              {deleteBtn}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="w-full">
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={mode === 'complete' ? handleComplete : handlePostpone}
                disabled={submitting}
                className="w-full"
              >
                {submitting && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'complete' ? t('tasks.completeTask' as any) : t('tasks.postpone' as any)}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>

        {meta}
        {tabs}
        {fields}

        <div className="flex justify-between items-center pt-2 border-t border-border">
          <div className="flex gap-2">
            {editBtn}
            {deleteBtn}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={mode === 'complete' ? handleComplete : handlePostpone}
              disabled={submitting}
            >
              {submitting && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'complete' ? t('tasks.completeTask' as any) : t('tasks.postpone' as any)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
