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
import { SpinnerGap, Plus, PencilSimple, TrashSimple, X } from '@phosphor-icons/react';
import { selectOptions, slugFieldName, type FieldOption } from '@/lib/customFieldOptions';

interface CustomField {
  id: string;
  module: string;
  name: string;
  label: string;
  field_type: string;
  is_required: boolean;
  order_index: number;
  options?: unknown;
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
  // Opções da Lista: rótulo (aparece no Seialz) + texto no contrato (opcional).
  const [options, setOptions] = useState<FieldOption[]>([]);
  const emptyForm = () => { setFormData({ module: 'contacts', name: '', label: '', field_type: 'text', is_required: false }); setOptions([]); };
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
    const name = slugFieldName(formData.name);
    const label = formData.label.trim();
    if (!name || !label) { toast({ variant: 'destructive', description: 'Preencha nome e rótulo.' }); return; }
    const cleanOptions = options
      .map((o) => ({ label: o.label.trim(), value: (o.value || o.label).trim(), contract_text: (o.contract_text ?? '').trim() }))
      .filter((o) => o.label)
      .map((o) => (o.contract_text ? o : { label: o.label, value: o.value }));
    if (formData.field_type === 'select' && cleanOptions.length === 0) {
      toast({ variant: 'destructive', description: 'Adicione pelo menos uma opção à lista.' });
      return;
    }
    if (new Set(cleanOptions.map((o) => o.value)).size !== cleanOptions.length) {
      toast({ variant: 'destructive', description: 'Há opções repetidas na lista.' });
      return;
    }
    const optionsPayload = formData.field_type === 'select' ? { options: cleanOptions } : null;

    try {
      if (editingField) {
        const { error } = await supabase
          .from('custom_field_definitions')
          .update({ label, is_required: formData.is_required, ...(formData.field_type === 'select' ? { options: optionsPayload } : {}) })
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
            name,
            label,
            options: optionsPayload,
            order_index: maxOrder + 1,
          });

        if (error) throw error;
        toast({ description: t('settings.customFieldCreated') });
      }

      setDialogOpen(false);
      setEditingField(null);
      emptyForm();
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
          <SpinnerGap className="h-8 w-8 animate-spin" />
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
                <Button onClick={() => { setEditingField(null); emptyForm(); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('settings.addCustomField')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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
                        onBlur={(e) => setFormData({ ...formData, name: slugFieldName(e.target.value) })}
                        placeholder="ex.: estado_civil"
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
                    {formData.field_type === 'select' && (
                      <div className="space-y-2">
                        <Label>Opções da lista</Label>
                        <p className="text-xs text-muted-foreground">
                          "Opção" é o que aparece no Seialz. "Texto no contrato" é opcional: se preenchido, é ele que entra no contrato no lugar da opção.
                        </p>
                        {options.map((o, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <Input
                              value={o.label}
                              placeholder="Opção (ex.: Nascimento)"
                              onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                            />
                            <Input
                              value={o.contract_text ?? ''}
                              placeholder="Texto no contrato (opcional)"
                              onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, contract_text: e.target.value } : x)))}
                            />
                            <Button type="button" variant="ghost" size="icon" aria-label="Remover opção" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => setOptions([...options, { label: '', value: '' }])}>
                          <Plus className="w-4 h-4 mr-1" /> Adicionar opção
                        </Button>
                      </div>
                    )}
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
                  <TableCell className="font-medium">
                    {field.label}
                    <div className="text-xs text-muted-foreground font-mono">{field.name}</div>
                  </TableCell>
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
                          setOptions(selectOptions(field.options));
                          setDialogOpen(true);
                        }}
                      >
                        <PencilSimple className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(field.id)}>
                        <TrashSimple className="w-4 h-4" />
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
