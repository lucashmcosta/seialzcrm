import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import { RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface DeletedItem {
  id: string;
  name: string;
  type: 'contacts' | 'opportunities' | 'tasks' | 'companies';
  deleted_at: string;
}

export function Trash() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (organization) {
      fetchDeletedItems();
    }
  }, [organization, filterType]);

  const fetchDeletedItems = async () => {
    if (!organization) return;

    setLoading(true);
    const allItems: DeletedItem[] = [];

    // Fetch deleted contacts
    if (filterType === 'all' || filterType === 'contacts') {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, deleted_at')
        .eq('organization_id', organization.id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (data) {
        allItems.push(
          ...data.map((item) => ({
            id: item.id,
            name: item.full_name,
            type: 'contacts' as const,
            deleted_at: item.deleted_at!,
          }))
        );
      }
    }

    // Fetch deleted opportunities
    if (filterType === 'all' || filterType === 'opportunities') {
      const { data } = await supabase
        .from('opportunities')
        .select('id, title, deleted_at')
        .eq('organization_id', organization.id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (data) {
        allItems.push(
          ...data.map((item) => ({
            id: item.id,
            name: item.title,
            type: 'opportunities' as const,
            deleted_at: item.deleted_at!,
          }))
        );
      }
    }

    // Fetch deleted tasks
    if (filterType === 'all' || filterType === 'tasks') {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, deleted_at')
        .eq('organization_id', organization.id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (data) {
        allItems.push(
          ...data.map((item) => ({
            id: item.id,
            name: item.title,
            type: 'tasks' as const,
            deleted_at: item.deleted_at!,
          }))
        );
      }
    }

    // Fetch deleted companies
    if (filterType === 'all' || filterType === 'companies') {
      const { data } = await supabase
        .from('companies')
        .select('id, name, deleted_at')
        .eq('organization_id', organization.id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (data) {
        allItems.push(
          ...data.map((item) => ({
            id: item.id,
            name: item.name,
            type: 'companies' as const,
            deleted_at: item.deleted_at!,
          }))
        );
      }
    }

    // Sort all items by deleted_at
    allItems.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

    setItems(allItems);
    setLoading(false);
  };

  const handleRestore = async (item: DeletedItem) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from(item.type)
        .update({ deleted_at: null })
        .eq('id', item.id);

      if (error) throw error;

      toast.success(t('trash.restored'));
      fetchDeletedItems();
    } catch (error) {
      console.error('Error restoring item:', error);
      toast.error(t('common.error'));
    } finally {
      setProcessing(false);
    }
  };

  const handleDeletePermanently = async (item: DeletedItem) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from(item.type)
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      toast.success(t('trash.deleted'));
      fetchDeletedItems();
    } catch (error) {
      console.error('Error deleting permanently:', error);
      toast.error(t('common.error'));
    } finally {
      setProcessing(false);
    }
  };

  const handleEmptyTrash = async () => {
    setProcessing(true);
    try {
      const promises = items.map((item) =>
        supabase.from(item.type).delete().eq('id', item.id)
      );

      await Promise.all(promises);

      toast.success(t('trash.emptied'));
      fetchDeletedItems();
    } catch (error) {
      console.error('Error emptying trash:', error);
      toast.error(t('common.error'));
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(dateString));
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{t('trash.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('trash.description')}</p>
          </div>
          {items.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={processing}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('trash.emptyTrash')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    {t('trash.confirmEmpty')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('trash.emptyWarning')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleEmptyTrash}>
                    {t('trash.emptyTrash')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('common.filter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="contacts">{t('navigation.contacts')}</SelectItem>
            <SelectItem value="opportunities">{t('navigation.opportunities')}</SelectItem>
            <SelectItem value="tasks">{t('navigation.tasks')}</SelectItem>
            <SelectItem value="companies">{t('navigation.companies')}</SelectItem>
          </SelectContent>
        </Select>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t('trash.noItems')}</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.type')}</TableHead>
                  <TableHead>{t('trash.deletedAt')}</TableHead>
                  <TableHead>{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={`${item.type}-${item.id}`}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {t(`navigation.${item.type}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(item.deleted_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(item)}
                          disabled={processing}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          {t('trash.restore')}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={processing}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('trash.deleteForever')}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('trash.confirmDelete')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {item.name}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeletePermanently(item)}>
                                {t('trash.deleteForever')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  );
}