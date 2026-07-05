// Configurações → WhatsApp → Respostas Rápidas (Snippets)
// CRUD completo, com preview de variáveis. Acesso: canManageSettings ou
// canManageIntegrations (Admin/Manager). Usuários comuns caem no fallback.

import { useEffect, useMemo, useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { SpinnerGap, Plus, PencilSimple, TrashSimple, LockKey } from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { interpolateSnippet } from '@/lib/interpolateSnippet';
import type { MessageSnippet } from '@/hooks/useSnippets';

const PURPOSE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'commercial', label: 'Comercial' },
  { value: 'customer_service', label: 'Atendimento' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'other', label: 'Outros' },
];

const PREVIEW_VARS = {
  contactName: 'Maria Silva',
  companyName: 'Empresa Exemplo',
  agentName: 'João (Comercial)',
  commercialNumber: '+55 11 5028-7020',
  serviceNumber: '+55 11 5028-7027',
};

const EMPTY_FORM = {
  title: '',
  shortcut: '',
  category: 'Comercial',
  body: '',
  allowed_purposes: ['commercial'] as string[],
  is_active: true,
};

type FormState = typeof EMPTY_FORM;

function previewBody(body: string): string {
  return interpolateSnippet(body, {
    nome_contato: PREVIEW_VARS.contactName,
    primeiro_nome: PREVIEW_VARS.contactName.split(' ')[0],
    empresa: PREVIEW_VARS.companyName,
    agente: PREVIEW_VARS.agentName,
    numero_comercial: PREVIEW_VARS.commercialNumber,
    numero_atendimento: PREVIEW_VARS.serviceNumber,
  });
}

export default function WhatsAppSnippetsPage() {
  const { organization } = useOrganization();
  const { permissions } = usePermissions();
  const { toast } = useToast();
  const canManage = permissions.canManageSettings || permissions.canManageIntegrations;

  const [snippets, setSnippets] = useState<MessageSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MessageSnippet | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSnippets = async () => {
    if (!organization?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('message_snippets' as any)
      .select('*')
      .eq('organization_id', organization.id)
      .order('usage_count', { ascending: false })
      .order('title', { ascending: true });
    if (error) {
      console.error('[snippets] fetch failed', error);
      toast({ variant: 'destructive', description: 'Erro ao carregar snippets.' });
    } else {
      setSnippets((data ?? []) as unknown as MessageSnippet[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSnippets(); /* eslint-disable-next-line */ }, [organization?.id]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (s: MessageSnippet) => {
    setEditing(s);
    setForm({
      title: s.title,
      shortcut: s.shortcut ?? '',
      category: s.category ?? '',
      body: s.body,
      allowed_purposes: [...(s.allowed_purposes ?? [])],
      is_active: s.is_active,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;
    if (!form.title.trim() || !form.body.trim()) {
      toast({ variant: 'destructive', description: 'Título e mensagem são obrigatórios.' });
      return;
    }
    if (form.allowed_purposes.length === 0) {
      toast({ variant: 'destructive', description: 'Selecione ao menos um propósito.' });
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      shortcut: form.shortcut.trim() || null,
      category: form.category.trim() || null,
      body: form.body,
      allowed_purposes: form.allowed_purposes,
      is_active: form.is_active,
    };
    try {
      if (editing) {
        const { error } = await supabase
          .from('message_snippets' as any)
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ description: 'Snippet atualizado.' });
      } else {
        const { error } = await supabase
          .from('message_snippets' as any)
          .insert({ ...payload, organization_id: organization.id });
        if (error) throw error;
        toast({ description: 'Snippet criado.' });
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      await fetchSnippets();
    } catch (err: any) {
      console.error('[snippets] save failed', err);
      toast({ variant: 'destructive', description: err.message || 'Erro ao salvar.' });
    } finally {
      setSaving(false);
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
      // Soft delete
      const { error } = await supabase
        .from('message_snippets' as any)
        .update({ is_active: false })
        .eq('id', deletingId);
      if (error) throw error;
      toast({ description: 'Snippet desativado.' });
      await fetchSnippets();
    } catch (err: any) {
      toast({ variant: 'destructive', description: err.message || 'Erro ao excluir.' });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setDeletingId(null);
    }
  };

  const previewText = useMemo(() => previewBody(form.body), [form.body]);

  if (!canManage) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
          <LockKey className="h-10 w-10 text-muted-foreground" />
          <div>
            <div className="text-lg font-medium">Acesso restrito</div>
            <div className="text-sm text-muted-foreground">
              Apenas administradores e gestores podem gerenciar respostas rápidas.
            </div>
          </div>
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
              <CardTitle>Respostas Rápidas</CardTitle>
              <CardDescription>
                Mensagens pré-prontas para o time enviar dentro da janela WhatsApp aberta.
                Não são templates Meta — são texto livre com variáveis.
              </CardDescription>
            </div>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Nova resposta
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <SpinnerGap className="h-8 w-8 animate-spin" />
            </div>
          ) : snippets.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma resposta rápida cadastrada.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Atalho</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Propósitos</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Usos</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snippets.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.title}</TableCell>
                    <TableCell>
                      {s.shortcut ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {s.shortcut}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>{s.category ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(s.allowed_purposes ?? []).map((p) => (
                          <Badge key={p} variant="secondary">
                            {PURPOSE_OPTIONS.find((o) => o.value === p)?.label ?? p}
                          </Badge>
                        ))}
                        {(!s.allowed_purposes || s.allowed_purposes.length === 0) && (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.is_active ? 'default' : 'secondary'}>
                        {s.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.usage_count ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.last_used_at
                        ? formatDistanceToNow(new Date(s.last_used_at), { addSuffix: true, locale: ptBR })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                          <PencilSimple className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(s.id)}>
                          <TrashSimple className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar resposta rápida' : 'Nova resposta rápida'}</DialogTitle>
              <DialogDescription>
                Variáveis suportadas: <code>{'{{nome_contato}}'}</code>, <code>{'{{primeiro_nome}}'}</code>,{' '}
                <code>{'{{empresa}}'}</code>, <code>{'{{agente}}'}</code>,{' '}
                <code>{'{{numero_comercial}}'}</code>, <code>{'{{numero_atendimento}}'}</code>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="title">Título</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                    placeholder="Ex.: Rescisão"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shortcut">Atalho</Label>
                  <Input
                    id="shortcut"
                    value={form.shortcut}
                    onChange={(e) => setForm({ ...form, shortcut: e.target.value })}
                    placeholder="/rescisao"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Comercial / Atendimento / ..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">Mensagem</Label>
                <Textarea
                  id="body"
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  required
                  rows={6}
                  placeholder={'Ex.: Olá {{primeiro_nome}}, ...'}
                />
              </div>

              {form.body.trim() && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Preview (com variáveis de exemplo)</Label>
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                    {previewText || <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Propósitos permitidos</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PURPOSE_OPTIONS.map((opt) => {
                    const checked = form.allowed_purposes.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer hover:bg-accent">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setForm((prev) => ({
                              ...prev,
                              allowed_purposes: v
                                ? Array.from(new Set([...prev.allowed_purposes, opt.value]))
                                : prev.allowed_purposes.filter((p) => p !== opt.value),
                            }));
                          }}
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Ativo</div>
                  <div className="text-xs text-muted-foreground">Snippets inativos não aparecem no composer.</div>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <SpinnerGap className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editing ? 'Salvar alterações' : 'Criar snippet'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir resposta rápida"
        description="A resposta será desativada (soft delete). Você pode reativá-la editando novamente."
        confirmText="Excluir"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleting}
      />
    </>
  );
}
