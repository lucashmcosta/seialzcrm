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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';

interface PipelineStage {
  id: string;
  name: string;
  order_index: number;
  type: 'custom' | 'won' | 'lost';
}

export function PipelineSettings() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
  const [formData, setFormData] = useState<{ name: string; type: 'custom' | 'won' | 'lost'; order_index: number }>({ 
    name: '', 
    type: 'custom',
    order_index: 1
  });

  useEffect(() => {
    fetchStages();
  }, [organization?.id]);

  const fetchStages = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('organization_id', organization.id)
        .order('order_index');

      if (error) throw error;
      setStages(data || []);
    } catch (error) {
      console.error('Error fetching stages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    try {
      if (editingStage) {
        const { error } = await supabase
          .from('pipeline_stages')
          .update({ name: formData.name, order_index: formData.order_index })
          .eq('id', editingStage.id);

        if (error) throw error;
        toast({ description: t('settings.stageUpdated') });
      } else {
        const { error } = await supabase
          .from('pipeline_stages')
          .insert({
            organization_id: organization.id,
            name: formData.name,
            type: formData.type,
            order_index: formData.order_index,
          });

        if (error) throw error;
        toast({ description: t('settings.stageCreated') });
      }

      setDialogOpen(false);
      setEditingStage(null);
      setFormData({ name: '', type: 'custom', order_index: 1 });
      fetchStages();
    } catch (error) {
      console.error('Error saving stage:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;

    try {
      const { error } = await supabase
        .from('pipeline_stages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ description: t('settings.stageDeleted') });
      fetchStages();
    } catch (error) {
      console.error('Error deleting stage:', error);
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
            <CardTitle>{t('settings.pipelineStages')}</CardTitle>
            <CardDescription>Manage your sales pipeline stages</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { 
                setEditingStage(null); 
                const nextOrder = Math.max(...stages.filter(s => s.type === 'custom').map(s => s.order_index), 0) + 1;
                setFormData({ name: '', type: 'custom', order_index: nextOrder }); 
              }}>
                <Plus className="w-4 h-4 mr-2" />
                {t('settings.addStage')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{editingStage ? t('common.edit') : t('settings.addStage')}</DialogTitle>
                  <DialogDescription>
                    {editingStage ? 'Edit stage details' : 'Add a new pipeline stage'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('settings.stageName')}</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="order">{t('settings.order')}</Label>
                    <Input
                      id="order"
                      type="number"
                      min={1}
                      value={formData.order_index}
                      onChange={(e) => setFormData({ ...formData, order_index: parseInt(e.target.value) || 1 })}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      Número menor = aparece primeiro no pipeline
                    </p>
                  </div>
                  {!editingStage && (
                    <div className="space-y-2">
                      <Label htmlFor="type">{t('settings.stageType')}</Label>
                      <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                        <SelectTrigger id="type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">{t('settings.stageCustom')}</SelectItem>
                          <SelectItem value="won" disabled={stages.some(s => s.type === 'won')}>
                            {t('settings.stageWon')}
                          </SelectItem>
                          <SelectItem value="lost" disabled={stages.some(s => s.type === 'lost')}>
                            {t('settings.stageLost')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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
              <TableHead>{t('settings.stageName')}</TableHead>
              <TableHead>{t('settings.stageType')}</TableHead>
              <TableHead>{t('settings.order')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.map((stage) => (
              <TableRow key={stage.id}>
                <TableCell className="font-medium">{stage.name}</TableCell>
                <TableCell>
                  {stage.type === 'won' && t('settings.stageWon')}
                  {stage.type === 'lost' && t('settings.stageLost')}
                  {stage.type === 'custom' && t('settings.stageCustom')}
                </TableCell>
                <TableCell>{stage.order_index}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingStage(stage);
                        setFormData({ name: stage.name, type: stage.type, order_index: stage.order_index });
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {stage.type === 'custom' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(stage.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
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
