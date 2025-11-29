import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';

interface Tag {
  id: string;
  name: string;
  color: string;
}

export function TagsSettings() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [formData, setFormData] = useState({ name: '', color: '#6366f1' });

  useEffect(() => {
    fetchTags();
  }, [organization?.id]);

  const fetchTags = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('organization_id', organization.id)
        .order('name');

      if (error) throw error;
      setTags(data || []);
    } catch (error) {
      console.error('Error fetching tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    try {
      if (editingTag) {
        const { error } = await supabase
          .from('tags')
          .update(formData)
          .eq('id', editingTag.id);

        if (error) throw error;
        toast({ description: t('settings.tagUpdated') });
      } else {
        const { error } = await supabase
          .from('tags')
          .insert({
            organization_id: organization.id,
            ...formData,
          });

        if (error) throw error;
        toast({ description: t('settings.tagCreated') });
      }

      setDialogOpen(false);
      setEditingTag(null);
      setFormData({ name: '', color: '#6366f1' });
      fetchTags();
    } catch (error) {
      console.error('Error saving tag:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;

    try {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ description: t('settings.tagDeleted') });
      fetchTags();
    } catch (error) {
      console.error('Error deleting tag:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    }
  };

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
          <div>
            <CardTitle>{t('settings.tags')}</CardTitle>
            <CardDescription>Manage tags for contacts and opportunities</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingTag(null); setFormData({ name: '', color: '#6366f1' }); }}>
                <Plus className="w-4 h-4 mr-2" />
                {t('settings.addTag')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{editingTag ? t('common.edit') : t('settings.addTag')}</DialogTitle>
                  <DialogDescription>
                    {editingTag ? 'Edit tag details' : 'Create a new tag'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('settings.tagName')}</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="color">{t('settings.tagColor')}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="color"
                        type="color"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        className="w-20 h-10"
                      />
                      <Input
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        placeholder="#6366f1"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">{t('common.save')}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('settings.tagName')}</TableHead>
              <TableHead>{t('settings.tagColor')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell className="font-medium">{tag.name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="text-sm text-muted-foreground">{tag.color}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingTag(tag);
                        setFormData({ name: tag.name, color: tag.color });
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(tag.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
