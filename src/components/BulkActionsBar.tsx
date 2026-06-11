import { useState } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';
import { X, User, Prohibit, TrashSimple, Stack } from '@phosphor-icons/react';

interface User {
  id: string;
  full_name: string;
}

interface StageOption {
  id: string;
  name: string;
  type?: string; // 'open' | 'won' | 'lost'
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
  /** Apenas para `opportunities`: lista de etapas disponíveis para mover em massa */
  stages?: StageOption[];
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
  stages,
}: BulkActionsBarProps) {
  const { t } = useTranslation(locale as any);
  const [processing, setProcessing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const handleChangeStage = async (stageId: string) => {
    if (!stageId || selectedIds.length === 0 || module !== 'opportunities') return;
    const target = stages?.find((s) => s.id === stageId);
    if (!target) return;

    setProcessing(true);
    try {
      const status =
        target.type === 'won' ? 'won' : target.type === 'lost' ? 'lost' : 'open';
      const { error } = await supabase
        .from('opportunities')
        .update({ pipeline_stage_id: stageId, status })
        .in('id', selectedIds);

      if (error) throw error;

      toast({ title: t('common.success') });
      onSuccess();
      onClear();
    } catch (error) {
      console.error('Error changing stage:', error);
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
      setConfirmOpen(false);
    }
  };

  if (selectedIds.length === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-primary text-primary-foreground rounded-lg shadow-lg p-4 flex items-center gap-4 flex-wrap">
          <span className="font-medium">
            {selectedIds.length} {selectedIds.length === 1 ? 'selecionado' : 'selecionados'}
          </span>

          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && module === 'opportunities' && stages && stages.length > 0 && (
              <Select onValueChange={handleChangeStage} disabled={processing}>
                <SelectTrigger className="w-48 bg-background text-foreground">
                  <Stack className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Mover para etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

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
                color="secondary"
                size="sm"
                onClick={handleMarkDoNotContact}
                disabled={processing}
              >
                <Prohibit className="h-4 w-4 mr-2" />
                {t('contacts.doNotContact')}
              </Button>
            )}

            {canDelete && (
              <Button
                color="destructive"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={processing}
              >
                <TrashSimple className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </Button>
            )}

            <Button
              color="ghost"
              size="sm"
              onClick={onClear}
              className="text-primary-foreground hover:text-primary-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir itens selecionados"
        description={`Tem certeza que deseja excluir ${selectedIds.length} ${selectedIds.length === 1 ? 'item' : 'itens'}? Esta ação pode ser revertida através da lixeira.`}
        confirmText="Excluir"
        variant="destructive"
        onConfirm={handleDelete}
        loading={processing}
      />
    </>
  );
}
