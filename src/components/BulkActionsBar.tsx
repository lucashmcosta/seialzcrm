import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';
import { X, User, Tag, Ban, Trash2 } from 'lucide-react';

interface User {
  id: string;
  full_name: string;
}

interface BulkActionsBarProps {
  selectedIds: string[];
  module: 'contacts' | 'opportunities';
  users: User[];
  onClear: () => void;
  onSuccess: () => void;
  locale: string;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function BulkActionsBar({
  selectedIds,
  module,
  users,
  onClear,
  onSuccess,
  locale,
  canEdit = true,
  canDelete = true,
}: BulkActionsBarProps) {
  const { t } = useTranslation(locale as any);
  const [processing, setProcessing] = useState(false);

  const handleChangeOwner = async (ownerId: string) => {
    if (!ownerId || selectedIds.length === 0) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from(module)
        .update({ owner_user_id: ownerId })
        .in('id', selectedIds);

      if (error) throw error;

      toast({ title: t('common.success') });
      onSuccess();
      onClear();
    } catch (error) {
      console.error('Error updating owner:', error);
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkDoNotContact = async () => {
    if (module !== 'contacts' || selectedIds.length === 0) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ do_not_contact: true })
        .in('id', selectedIds);

      if (error) throw error;

      toast({ title: t('common.success') });
      onSuccess();
      onClear();
    } catch (error) {
      console.error('Error marking do not contact:', error);
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(t('common.confirm'))) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from(module)
        .update({ deleted_at: new Date().toISOString() })
        .in('id', selectedIds);

      if (error) throw error;

      toast({ title: t('common.success') });
      onSuccess();
      onClear();
    } catch (error) {
      console.error('Error deleting:', error);
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  if (selectedIds.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg p-4 flex items-center gap-4">
        <span className="font-medium">
          {selectedIds.length} {t('common.select')}
        </span>

        <div className="flex items-center gap-2">
          {canEdit && (
            <Select onValueChange={handleChangeOwner} disabled={processing}>
              <SelectTrigger className="w-48 bg-background text-foreground">
                <User className="h-4 w-4 mr-2" />
                <SelectValue placeholder={t('contacts.owner')} />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {canEdit && module === 'contacts' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMarkDoNotContact}
              disabled={processing}
            >
              <Ban className="h-4 w-4 mr-2" />
              {t('contacts.doNotContact')}
            </Button>
          )}

          {canDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={processing}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('common.delete')}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-primary-foreground hover:text-primary-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
