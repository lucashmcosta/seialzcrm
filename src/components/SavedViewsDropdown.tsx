import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';
import { BookMarked, Plus, Trash2 } from 'lucide-react';

interface SavedView {
  id: string;
  name: string;
  filters: any;
  sort: any;
  is_default: boolean;
}

interface SavedViewsDropdownProps {
  module: 'contacts' | 'opportunities';
  currentFilters: any;
  currentSort: any;
  onApplyView: (filters: any, sort: any) => void;
}

export function SavedViewsDropdown({
  module,
  currentFilters,
  currentSort,
  onApplyView,
}: SavedViewsDropdownProps) {
  const { organization, userProfile } = useOrganization();
  const { locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const [views, setViews] = useState<SavedView[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewName, setViewName] = useState('');

  useEffect(() => {
    if (organization) {
      fetchViews();
    }
  }, [organization, module]);

  const fetchViews = async () => {
    if (!organization) return;

    const { data } = await supabase
      .from('saved_views')
      .select('*')
      .eq('organization_id', organization.id)
      .eq('module', module)
      .order('name');

    if (data) setViews(data);
  };

  const handleSaveView = async () => {
    if (!organization || !userProfile || !viewName.trim()) return;

    try {
      const { error } = await supabase.from('saved_views').insert([
        {
          organization_id: organization.id,
          module,
          name: viewName,
          owner_user_id: userProfile.id,
          filters: currentFilters,
          sort: currentSort,
          is_default: false,
        },
      ]);

      if (error) throw error;

      toast({ title: t('savedViews.created') });
      setViewName('');
      setDialogOpen(false);
      fetchViews();
    } catch (error) {
      console.error('Error saving view:', error);
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const handleDeleteView = async (viewId: string) => {
    try {
      const { error } = await supabase
        .from('saved_views')
        .delete()
        .eq('id', viewId);

      if (error) throw error;

      toast({ title: t('savedViews.deleted') });
      fetchViews();
    } catch (error) {
      console.error('Error deleting view:', error);
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <BookMarked className="h-4 w-4 mr-2" />
            {t('savedViews.save')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('savedViews.save')}
          </DropdownMenuItem>
          {views.length > 0 && <DropdownMenuSeparator />}
          {views.map((view) => (
            <DropdownMenuItem
              key={view.id}
              className="flex justify-between items-center"
              onClick={() => onApplyView(view.filters, view.sort)}
            >
              <span>{view.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteView(view.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('savedViews.save')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="viewName">{t('savedViews.name')}</Label>
              <Input
                id="viewName"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder={t('savedViews.name')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSaveView} disabled={!viewName.trim()}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
