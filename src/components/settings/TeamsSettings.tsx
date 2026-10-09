import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from '@/hooks/use-toast';
import { Plus, PencilSimple, TrashSimple } from '@phosphor-icons/react';

interface Team { id: string; name: string; members: string[] }

export function TeamsSettings() {
  const { organization } = useOrganization();
  const { permissions, loading } = usePermissions();
  const orgId = organization?.id;

  const { data, refetch } = useQuery({
    queryKey: ['teams-settings', orgId],
    enabled: !!orgId && permissions.rbacV2,
    queryFn: async () => {
      const [{ data: teams }, { data: tm }, { data: users }] = await Promise.all([
        supabase.from('teams').select('id, name').eq('organization_id', orgId!).order('name'),
        supabase.from('team_members').select('team_id, user_id').eq('organization_id', orgId!),
        supabase.from('user_organizations').select('user_id, users(full_name, email)').eq('organization_id', orgId!).eq('is_active', true),
      ]);
      const list: Team[] = (teams ?? []).map((t) => ({ id: t.id, name: t.name, members: (tm ?? []).filter((m) => m.team_id === t.id).map((m) => m.user_id) }));
      const people = (users ?? []).map((u: any) => ({ id: u.user_id as string, name: (u.users?.full_name || u.users?.email || '—') as string }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { list, people };
    },
  });
  const [edit, setEdit] = useState<{ id: string | null; name: string; members: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!permissions.rbacV2 || !permissions.canManageTeams) return <Navigate to="/settings" replace />;

  const people = data?.people ?? [];
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '—';

  const save = async () => {
    if (!edit || !orgId || !edit.name.trim()) return;
    setBusy(true);
    try {
      let id = edit.id;
      if (id) {
        const { error } = await supabase.from('teams').update({ name: edit.name.trim() }).eq('id', id);
        if (error) throw error;
      } else {
        const { data: row, error } = await supabase.from('teams').insert({ name: edit.name.trim(), organization_id: orgId }).select('id').single();
        if (error) throw error;
        id = row.id;
      }
      const current = data?.list.find((t) => t.id === id)?.members ?? [];
      const add = edit.members.filter((m) => !current.includes(m));
      const del = current.filter((m) => !edit.members.includes(m));
      if (del.length) { const { error } = await supabase.from('team_members').delete().eq('team_id', id!).in('user_id', del); if (error) throw error; }
      if (add.length) { const { error } = await supabase.from('team_members').insert(add.map((u) => ({ team_id: id!, user_id: u, organization_id: orgId }))); if (error) throw error; }
      toast({ description: 'Equipe salva.' });
      setEdit(null);
      refetch();
    } catch {
      toast({ variant: 'destructive', description: 'Não foi possível salvar a equipe.' });
    } finally { setBusy(false); }
  };

  const remove = async (t: Team) => {
    if (!confirm(`Excluir a equipe "${t.name}"? As pessoas continuam na organização.`)) return;
    const { error } = await supabase.from('teams').delete().eq('id', t.id);
    if (error) return toast({ variant: 'destructive', description: 'Não foi possível excluir a equipe.' });
    refetch();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Equipes</CardTitle>
          <CardDescription>Quem tem acesso "Equipe" vê os registros das pessoas das suas equipes. Uma pessoa pode estar em mais de uma.</CardDescription>
        </div>
        <Button onClick={() => setEdit({ id: null, name: '', members: [] })}><Plus className="w-4 h-4 mr-2" />Nova equipe</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {(data?.list ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma equipe criada.</p>}
        {(data?.list ?? []).map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-md border p-3 gap-3">
            <div className="min-w-0">
              <div className="font-medium text-sm">{t.name}</div>
              <div className="text-xs text-muted-foreground truncate">{t.members.length ? t.members.map(nameOf).join(', ') : 'Sem membros'}</div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEdit({ id: t.id, name: t.name, members: t.members })}><PencilSimple className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => remove(t)}><TrashSimple className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}
      </CardContent>
      {edit && (
        <Dialog open onOpenChange={(v) => !v && setEdit(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{edit.id ? 'Editar equipe' : 'Nova equipe'}</DialogTitle></DialogHeader>
            <Input placeholder="Nome da equipe" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <div className="space-y-1">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm py-1">
                  <Checkbox checked={edit.members.includes(p.id)} onCheckedChange={(v) =>
                    setEdit({ ...edit, members: v ? [...edit.members, p.id] : edit.members.filter((m) => m !== p.id) })} />
                  {p.name}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button onClick={save} disabled={busy || !edit.name.trim()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

export default TeamsSettings;
