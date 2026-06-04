import { useState } from 'react';
import { useDocumentTypes, type DocumentType } from '@/hooks/documents/useDocumentTypes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { SpinnerGap, Plus, PencilSimple, TrashSimple } from '@phosphor-icons/react';

interface FormState {
  name: string;
  code: string;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

const empty: FormState = { name: '', code: '', is_required: false, sort_order: 0, is_active: true };

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function DocumentsSettings() {
  const { types, loading, create, update, softDelete } = useDocumentTypes();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentType | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<DocumentType | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...empty, sort_order: types.length });
    setOpen(true);
  };

  const openEdit = (t: DocumentType) => {
    setEditing(t);
    setForm({
      name: t.name,
      code: t.code,
      is_required: t.is_required,
      sort_order: t.sort_order,
      is_active: t.is_active,
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const code = form.code.trim() || slugify(form.name);
    setSaving(true);
    try {
      if (editing) {
        await update(editing.id, { ...form, code });
        toast({ description: 'Tipo atualizado' });
      } else {
        await create({ ...form, code });
        toast({ description: 'Tipo criado' });
      }
      setOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', description: e.message || 'Erro' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!removing) return;
    try {
      await softDelete(removing.id);
      toast({ description: 'Tipo desativado' });
      setRemoving(null);
    } catch (e: any) {
      toast({ variant: 'destructive', description: e.message || 'Erro' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Tipos de Documento</CardTitle>
            <CardDescription>
              Configure os documentos exigidos no checklist de cada contato. Aplicado também nas oportunidades.
            </CardDescription>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Novo tipo
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 flex justify-center">
              <SpinnerGap className="h-6 w-6 animate-spin" />
            </div>
          ) : types.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhum tipo configurado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Ordem</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Obrigatório</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.sort_order}</TableCell>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.code}</TableCell>
                    <TableCell>{t.is_required ? 'Sim' : 'Não'}</TableCell>
                    <TableCell>
                      <Badge variant={t.is_active ? 'default' : 'secondary'}>
                        {t.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                        <PencilSimple className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setRemoving(t)}>
                        <TrashSimple className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar tipo' : 'Novo tipo de documento'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Code (identificador)</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="ex: cpf, rg, contrato_social"
              />
              <p className="text-xs text-muted-foreground">Único por organização. Deixe vazio para gerar a partir do nome.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="order">Ordem</Label>
                <Input
                  id="order"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value || '0', 10) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Obrigatório</Label>
                <div className="flex items-center h-10">
                  <Switch
                    checked={form.is_required}
                    onCheckedChange={(v) => setForm({ ...form, is_required: v })}
                  />
                </div>
              </div>
            </div>
            {editing && (
              <div className="space-y-2">
                <Label>Ativo</Label>
                <div className="flex items-center h-10">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <SpinnerGap className="w-4 h-4 mr-1 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Excluir tipo"
        description={`Excluir o tipo "${removing?.name}"? Documentos já enviados serão mantidos no histórico.`}
        confirmText="Excluir"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </div>
  );
}
