import { useMemo, useState } from 'react';
import { useDocumentCatalog, type CatalogType, type LocalTypeInput } from '@/hooks/documents/useDocumentCatalog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/hooks/use-toast';
import { SpinnerGap, Plus, PencilSimple, TrashSimple } from '@phosphor-icons/react';
import { CATEGORY_LABELS, CATEGORY_ORDER, categoryLabel } from '@/lib/documentCategories';

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const emptyLocal: LocalTypeInput = {
  name: '', code: '', category_code: 'OUTROS', owner_type: 'contact', cardinality: 'single',
  reference_kind: 'none', validity_mode: 'none', validity_days: null, has_two_sides: false,
};

function TypeBadges({ t }: { t: CatalogType }) {
  const refLabel: Record<string, string> = { date: 'Data', month: 'Mês', period: 'Período' };
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="secondary" className="text-[10px]">{t.cardinality === 'single' ? 'Único' : 'Vários'}</Badge>
      <Badge variant="outline" className="text-[10px]">{t.owner_type === 'contact' ? 'Contato' : 'Oportunidade'}</Badge>
      {t.reference_kind !== 'none' && <Badge variant="outline" className="text-[10px]">{refLabel[t.reference_kind]}</Badge>}
      {t.has_two_sides && <Badge variant="outline" className="text-[10px]">Frente/Verso</Badge>}
      {t.validity_mode === 'derived' && <Badge variant="outline" className="text-[10px]">Vence {t.validity_days}d</Badge>}
      {t.validity_mode === 'stated' && <Badge variant="outline" className="text-[10px]">Validade no doc</Badge>}
      {t.is_local && <Badge className="text-[10px]">Local</Badge>}
    </div>
  );
}

export function DocumentsSettings() {
  const { catalog, loading, setEnabled, createLocal, updateLocal, deleteLocal } = useDocumentCatalog();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocalTypeInput>(emptyLocal);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<CatalogType | null>(null);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? catalog.filter((t) => `${t.name} ${t.code}`.toLowerCase().includes(q)) : catalog;
    const byCat = new Map<string, CatalogType[]>();
    for (const t of filtered) {
      const cat = t.category_code || 'OUTROS';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(t);
    }
    return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({ code: c, label: CATEGORY_LABELS[c], items: byCat.get(c)! }));
  }, [catalog, search]);

  const enabledCount = catalog.filter((t) => t.is_enabled).length;

  const openCreate = () => { setEditingId(null); setForm(emptyLocal); setOpen(true); };
  const openEdit = (t: CatalogType) => {
    setEditingId(t.id);
    setForm({
      name: t.name, code: t.code, category_code: t.category_code || 'OUTROS', owner_type: t.owner_type,
      cardinality: t.cardinality, reference_kind: t.reference_kind, validity_mode: t.validity_mode,
      validity_days: t.validity_days, has_two_sides: t.has_two_sides,
    });
    setOpen(true);
  };

  const toggle = (t: CatalogType, enabled: boolean) => {
    setEnabled.mutate({ typeId: t.id, enabled }, {
      onError: (e: unknown) => toast({ variant: 'destructive', description: (e as Error)?.message || 'Erro ao alterar' }),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const code = form.code.trim() || slugify(form.name);
    // Coerência com os CHECKs do banco.
    const input: LocalTypeInput = {
      ...form,
      code,
      validity_days: form.validity_mode === 'derived' ? (form.validity_days ?? 0) : null,
      has_two_sides: form.cardinality === 'multiple' ? false : form.has_two_sides,
    };
    setSaving(true);
    try {
      if (editingId) {
        await updateLocal.mutateAsync({ id: editingId, input });
        toast({ description: 'Tipo atualizado' });
      } else {
        await createLocal.mutateAsync(input);
        toast({ description: 'Tipo criado e habilitado' });
      }
      setOpen(false);
    } catch (err) {
      toast({ variant: 'destructive', description: (err as Error)?.message || 'Erro ao salvar' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!removing) return;
    try {
      await deleteLocal.mutateAsync(removing.id);
      toast({ description: 'Tipo removido' });
      setRemoving(null);
    } catch (err) {
      toast({ variant: 'destructive', description: (err as Error)?.message || 'Erro ao remover' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Catálogo de documentos</CardTitle>
            <CardDescription>
              Ligue/desligue quais tipos aparecem no upload desta organização. {enabledCount} habilitado(s).
            </CardDescription>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Novo tipo local</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="Buscar tipo..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          {loading ? (
            <div className="py-8 flex justify-center"><SpinnerGap className="h-6 w-6 animate-spin" /></div>
          ) : groups.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum tipo encontrado.</p>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.code} className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
                  <div className="border rounded-lg divide-y">
                    {g.items.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{t.name}</span>
                          </div>
                          <div className="mt-1"><TypeBadges t={t} /></div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {t.is_local && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} title="Editar"><PencilSimple className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRemoving(t)} title="Remover"><TrashSimple className="w-4 h-4" /></Button>
                            </>
                          )}
                          <Switch checked={t.is_enabled} onCheckedChange={(v) => toggle(t, v)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar tipo local' : 'Novo tipo local'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Code (identificador)</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="vazio = gera do nome" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.category_code} onValueChange={(v) => setForm({ ...form, category_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORY_ORDER.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Dono</Label>
                <Select value={form.owner_type} onValueChange={(v) => setForm({ ...form, owner_type: v as LocalTypeInput['owner_type'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contact">Contato</SelectItem>
                    <SelectItem value="opportunity">Oportunidade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cardinalidade</Label>
                <Select value={form.cardinality} onValueChange={(v) => setForm({ ...form, cardinality: v as LocalTypeInput['cardinality'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Único (substitui/versiona)</SelectItem>
                    <SelectItem value="multiple">Vários (acumula)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Referência</Label>
                <Select value={form.reference_kind} onValueChange={(v) => setForm({ ...form, reference_kind: v as LocalTypeInput['reference_kind'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    <SelectItem value="date">Data</SelectItem>
                    <SelectItem value="month">Competência (mês)</SelectItem>
                    <SelectItem value="period">Período</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Validade</Label>
                <Select value={form.validity_mode} onValueChange={(v) => setForm({ ...form, validity_mode: v as LocalTypeInput['validity_mode'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não vence</SelectItem>
                    <SelectItem value="derived">Vence após N dias da referência</SelectItem>
                    <SelectItem value="stated">Impressa no documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.validity_mode === 'derived' && (
                <div className="space-y-2">
                  <Label>Dias de validade</Label>
                  <Input type="number" min={1} value={form.validity_days ?? ''} onChange={(e) => setForm({ ...form, validity_days: parseInt(e.target.value || '0', 10) })} />
                </div>
              )}
            </div>
            {form.cardinality === 'single' && (
              <div className="flex items-center justify-between">
                <Label>Duas faces (frente/verso)</Label>
                <Switch checked={form.has_two_sides} onCheckedChange={(v) => setForm({ ...form, has_two_sides: v })} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving && <SpinnerGap className="w-4 h-4 mr-1 animate-spin" />}Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remover tipo local"
        description={`Remover o tipo "${removing?.name}"? Documentos já enviados são mantidos no histórico.`}
        confirmText="Remover"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </div>
  );
}
