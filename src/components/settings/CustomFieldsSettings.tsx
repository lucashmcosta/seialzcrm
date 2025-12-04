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
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';

interface CustomField {
  id: string;
  module: string;
  name: string;
  label: string;
  field_type: string;
  is_required: boolean;
  order_index: number;
}

export function CustomFieldsSettings() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [formData, setFormData] = useState({
    module: 'contacts',
    name: '',
    label: '',
    field_type: 'text',
    is_required: false,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchFields();
  }, [organization?.id]);

  const fetchFields = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('custom_field_definitions')
        .select('*')
        .eq('organization_id', organization.id)
        .order('order_index');

      if (error) throw error;
      setFields(data || []);
    } catch (error) {
      console.error('Error fetching fields:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    try {
      if (editingField) {
        const { error } = await supabase
          .from('custom_field_definitions')
          .update({ label: formData.label, is_required: formData.is_required })
          .eq('id', editingField.id);

        if (error) throw error;
        toast({ description: t('settings.customFieldUpdated') });
      } else {
        const maxOrder = Math.max(...fields.map(f => f.order_index), 0);
        const { error } = await supabase
          .from('custom_field_definitions')
          .insert({
            organization_id: organization.id,
            ...formData,
            order_index: maxOrder + 1,
          });

        if (error) throw error;
        toast({ description: t('settings.customFieldCreated') });
      }

      setDialogOpen(false);
      setEditingField(null);
      setFormData({ module: 'contacts', name: '', label: '', field_type: 'text', is_required: false });
      fetchFields();
    } catch (error) {
      console.error('Error saving field:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('custom_field_definitions')
        .delete()
        .eq('id', deletingId);

      if (error) throw error;
      toast({ description: t('settings.customFieldDeleted') });
      fetchFields();
    } catch (error) {
      console.error('Error deleting field:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setDeletingId(null);
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
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('settings.customFields')}</CardTitle>
              <CardDescription>Create custom fields for contacts and opportunities</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingField(null); setFormData({ module: 'contacts', name: '', label: '', field_type: 'text', is_required: false }); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('settings.addCustomField')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleSubmit}>
                  <DialogHeader>
                    <DialogTitle>{editingField ? t('common.edit') : t('settings.addCustomField')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>{t('settings.customFieldModule')}</Label>
                      <Select
                        value={formData.module}
                        onValueChange={(value) => setFormData({ ...formData, module: value })}
                        disabled={!!editingField}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contacts">Contacts</SelectItem>
                          <SelectItem value="opportunities">Opportunities</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('settings.customFieldName')}</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="custom_field_name"
                        disabled={!!editingField}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('settings.customFieldLabel')}</Label>
                      <Input
                        value={formData.label}
                        onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                        placeholder="Field Label"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('settings.customFieldType')}</Label>
                      <Select
                        value={formData.field_type}
                        onValueChange={(value) => setFormData({ ...formData, field_type: value })}
                        disabled={!!editingField}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">{t('settings.customFieldTypeText')}</SelectItem>
                          <SelectItem value="number">{t('settings.customFieldTypeNumber')}</SelectItem>
                          <SelectItem value="date">{t('settings.customFieldTypeDate')}</SelectItem>
                          <SelectItem value="boolean">{t('settings.customFieldTypeBoolean')}</SelectItem>
                          <SelectItem value="select">{t('settings.customFieldTypeSelect')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>{t('settings.customFieldRequired')}</Label>
                      <Switch
                        checked={formData.is_required}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
                      />
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
                <TableHead>{t('settings.customFieldModule')}</TableHead>
                <TableHead>{t('settings.customFieldLabel')}</TableHead>
                <TableHead>{t('settings.customFieldType')}</TableHead>
                <TableHead>{t('settings.customFieldRequired')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field) => (
                <TableRow key={field.id}>
                  <TableCell className="capitalize">{field.module}</TableCell>
                  <TableCell className="font-medium">{field.label}</TableCell>
                  <TableCell className="capitalize">{field.field_type}</TableCell>
                  <TableCell>{field.is_required ? 'Yes' : 'No'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingField(field);
                          setFormData({
                            module: field.module,
                            name: field.name,
                            label: field.label,
                            field_type: field.field_type,
                            is_required: field.is_required,
                          });
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(field.id)}>
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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir Campo Personalizado"
        description="Tem certeza que deseja excluir este campo? Todos os dados associados a este campo serão perdidos."
        confirmText="Excluir"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleting}
      />
    </>
  );
}
