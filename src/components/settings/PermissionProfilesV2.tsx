import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from '@/hooks/use-toast';
import { Plus, PencilSimple, TrashSimple, Copy, Lock } from '@phosphor-icons/react';
import type { PermissionsV2, Scope } from '@/lib/permissions/types';
import { SCOPE_ORDER } from '@/lib/permissions/types';
import { fromLegacy, toLegacy } from '@/lib/permissions/convert';
import {
  ADMIN_ITEMS, DATA_OBJECTS, SCOPE_LABEL, SCOPE_RANK, TEMPLATES, TOOLS,
  blankPerms, hasBroadAccess, normalize, sentence, summarize, usesTeam,
} from '@/lib/permissions/catalog';

interface ProfileRow {
  id: string;
  name: string;
  is_system: boolean;
  permissions: Record<string, boolean> | null;
  permissions_v2: PermissionsV2 | null;
}

const effective = (p: ProfileRow): PermissionsV2 =>
  p.permissions_v2 ?? fromLegacy((p.permissions ?? {}) as Record<string, boolean>, true);

export function PermissionProfilesV2() {
  const { organization } = useOrganization();
  const { permissions } = usePermissions();
  const qc = useQueryClient();
  const orgId = organization?.id;
  const canEdit = permissions.canManageTeams; // Admin ou administracao.usuarios (o banco confere)

  const { data, refetch } = useQuery({
    queryKey: ['rbac-v2-profiles', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [{ data: profiles, error }, { data: members }] = await Promise.all([
        supabase.from('permission_profiles').select('id, name, is_system, permissions, permissions_v2').eq('organization_id', orgId!).order('name'),
        supabase.from('user_organizations').select('permission_profile_id').eq('organization_id', orgId!).eq('is_active', true),
      ]);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (members ?? []).forEach((m) => { if (m.permission_profile_id) counts[m.permission_profile_id] = (counts[m.permission_profile_id] ?? 0) + 1; });
      return { profiles: (profiles ?? []) as unknown as ProfileRow[], counts };
    },
  });

  const [editing, setEditing] = useState<{ id: string | null; name: string; perms: PermissionsV2 } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ProfileRow | null>(null);

  const profiles = data?.profiles ?? [];
  const counts = data?.counts ?? {};
  const invalidate = () => { refetch(); qc.invalidateQueries({ queryKey: ['permissions'] }); };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Perfis de Permissão</CardTitle>
            <CardDescription>Defina o que cada perfil vê e faz: só os próprios registros, os da equipe ou todos.</CardDescription>
          </div>
          {canEdit && <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />Novo perfil</Button>}
        </CardHeader>
        <CardContent className="space-y-2">
          {profiles.map((p) => {
            const perms = effective(p);
            return (
              <div key={p.id} className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.is_system && <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" />Sistema</Badge>}
                    <span className="text-xs text-muted-foreground">{counts[p.id] ?? 0} usuário(s)</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.is_system ? 'Acesso total. Não pode ser alterado nem excluído.' : DATA_OBJECTS.slice(0, 3).map((o) => `${o.label}: ${summarize(o, perms)}`).join(' — ')}
                  </p>
                </div>
                {canEdit && !p.is_system && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditing({ id: p.id, name: p.name, perms })}><PencilSimple className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Duplicar" onClick={() => setEditing({ id: null, name: `${p.name} (cópia)`, perms })}><Copy className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => setDeleting(p)}><TrashSimple className="w-4 h-4" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <NewProfileDialog open={creating} onOpenChange={setCreating} profiles={profiles}
        onPick={(name, perms) => { setCreating(false); setEditing({ id: null, name, perms }); }} />

      {editing && orgId && (
        <ProfileEditor key={editing.id ?? 'new'} orgId={orgId} initial={editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); invalidate(); }} />
      )}

      {deleting && (
        <DeleteProfileDialog profile={deleting} count={counts[deleting.id] ?? 0}
          options={profiles.filter((p) => p.id !== deleting.id)}
          onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); invalidate(); }} />
      )}
    </div>
  );
}

function NewProfileDialog({ open, onOpenChange, profiles, onPick }: {
  open: boolean; onOpenChange: (v: boolean) => void; profiles: ProfileRow[];
  onPick: (name: string, perms: PermissionsV2) => void;
}) {
  const [copyFrom, setCopyFrom] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo perfil</DialogTitle>
          <DialogDescription>Comece por um modelo pronto, uma cópia ou em branco.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" onClick={() => onPick(t.label, t.perms)}
              className="w-full text-left rounded-md border p-3 hover:bg-muted transition-colors">
              <div className="font-medium text-sm">{t.label}</div>
              <div className="text-xs text-muted-foreground">{t.description}</div>
            </button>
          ))}
          <div className="flex gap-2 pt-2">
            <Select value={copyFrom} onValueChange={setCopyFrom}>
              <SelectTrigger><SelectValue placeholder="Copiar de um perfil existente" /></SelectTrigger>
              <SelectContent>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" disabled={!copyFrom} onClick={() => {
              const p = profiles.find((x) => x.id === copyFrom); if (p) onPick(`${p.name} (cópia)`, effective(p));
            }}>Copiar</Button>
          </div>
          <Button variant="ghost" className="w-full" onClick={() => onPick('Novo perfil', blankPerms())}>Começar em branco</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScopePicker({ value, max, onChange, disabled }: { value: Scope; max?: Scope; onChange: (s: Scope) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-md border overflow-hidden">
      {SCOPE_ORDER.map((s) => {
        const blocked = disabled || (max && SCOPE_RANK[s] > SCOPE_RANK[max]);
        return (
          <button key={s} type="button" disabled={!!blocked} onClick={() => onChange(s)}
            className={`px-2.5 py-1 text-xs transition-colors ${value === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'} ${blocked ? 'opacity-40 cursor-not-allowed' : ''}`}>
            {SCOPE_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

function ProfileEditor({ orgId, initial, onClose, onSaved }: {
  orgId: string; initial: { id: string | null; name: string; perms: PermissionsV2 };
  onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [perms, setPerms] = useState<PermissionsV2>(() => normalize(initial.perms));
  const [saving, setSaving] = useState(false);
  const [confirmBroad, setConfirmBroad] = useState(false);

  const { data: teamCount = 0 } = useQuery({
    queryKey: ['teams-count', orgId],
    queryFn: async () => (await supabase.from('teams').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)).count ?? 0,
  });

  const setData = (obj: string, key: string, v: Scope | boolean) =>
    setPerms((p) => normalize({ ...p, dados: { ...p.dados, [obj]: { ...(p.dados as any)[obj], [key]: v } } }));

  const save = async () => {
    if (!name.trim()) return toast({ variant: 'destructive', description: 'Dê um nome ao perfil.' });
    const wasBroad = hasBroadAccess(normalize(initial.perms));
    if (!confirmBroad && hasBroadAccess(perms) && !wasBroad) { setConfirmBroad(true); return; }
    setSaving(true);
    const payload = { name: name.trim(), permissions_v2: perms as any, permissions: toLegacy(perms) as any };
    const { error } = initial.id
      ? await supabase.from('permission_profiles').update(payload).eq('id', initial.id)
      : await supabase.from('permission_profiles').insert({ ...payload, organization_id: orgId });
    setSaving(false);
    if (error) return toast({ variant: 'destructive', description: 'Não foi possível salvar. Só quem administra usuários pode alterar perfis.' });
    toast({ description: 'Perfil salvo.' });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial.id ? 'Editar perfil' : 'Novo perfil'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Nome</Label>
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {usesTeam(perms) && teamCount === 0 && (
          <p className="text-xs rounded-md border border-warning/40 bg-warning/10 p-2">
            Este perfil usa "Equipe", mas a organização ainda não tem equipes. Até criar equipes, "Equipe" funciona como "Meus".
          </p>
        )}
        <Tabs defaultValue="dados">
          <TabsList>
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="ferramentas">Ferramentas</TabsTrigger>
            <TabsTrigger value="administracao">Administração</TabsTrigger>
          </TabsList>
          <TabsContent value="dados" className="space-y-4">
            {DATA_OBJECTS.map((obj) => {
              const o = (perms.dados as any)[obj.key] as Record<string, Scope | boolean>;
              return (
                <div key={obj.key} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-sm">{obj.label}</span>
                    <span className="text-xs text-muted-foreground">{obj.subtitle}</span>
                  </div>
                  {obj.actions.filter((a) => !a.hidden).map((a) => (
                    <div key={a.key} className="flex items-center justify-between gap-3">
                      <div className="text-sm">{a.label}{a.hint && <span className="text-xs text-muted-foreground ml-2">{a.hint}</span>}</div>
                      {a.kind === 'scope'
                        ? <ScopePicker value={o[a.key] as Scope} max={a.cap ? (o[a.cap] as Scope) : undefined} onChange={(s) => setData(obj.key, a.key, s)} />
                        : <Switch checked={!!o[a.key]} disabled={o.ver === 'nenhum'} onCheckedChange={(v) => setData(obj.key, a.key, v)} />}
                    </div>
                  ))}
                  {'sem_responsavel' in o && obj.unassignedLabel && (
                    <label className="flex items-center gap-2 text-sm pt-1">
                      <Checkbox checked={!!o.sem_responsavel} disabled={o.ver === 'nenhum' || o.ver === 'todos'}
                        onCheckedChange={(v) => setData(obj.key, 'sem_responsavel', !!v)} />
                      {obj.unassignedLabel}
                    </label>
                  )}
                </div>
              );
            })}
          </TabsContent>
          <TabsContent value="ferramentas" className="space-y-2">
            {TOOLS.filter((t) => !t.hidden).map((t) => (
              <div key={t.key} className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm">{t.label}</span>
                <Switch checked={!!perms.ferramentas[t.key]} onCheckedChange={(v) => setPerms((p) => ({ ...p, ferramentas: { ...p.ferramentas, [t.key]: v } }))} />
              </div>
            ))}
          </TabsContent>
          <TabsContent value="administracao" className="space-y-2">
            {ADMIN_ITEMS.filter((a) => !a.hidden).map((a) => (
              <div key={a.key} className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm">{a.label}</span>
                <Switch checked={!!perms.administracao[a.key]} onCheckedChange={(v) => setPerms((p) => ({ ...p, administracao: { ...p.administracao, [a.key]: v } }))} />
              </div>
            ))}
          </TabsContent>
        </Tabs>
        <div className="rounded-md bg-muted p-3 space-y-1">
          <div className="text-xs font-semibold">Resumo</div>
          {DATA_OBJECTS.map((o) => <p key={o.key} className="text-xs text-muted-foreground">{sentence(o, perms)}</p>)}
        </div>
        {confirmBroad && (
          <p className="text-xs rounded-md border border-destructive/40 bg-destructive/10 p-2">
            Este perfil passa a ver registros de todas as pessoas da organização. Clique em Salvar de novo para confirmar.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProfileDialog({ profile, count, options, onClose, onDone }: {
  profile: ProfileRow; count: number; options: ProfileRow[]; onClose: () => void; onDone: () => void;
}) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('rbac_v2_delete_profile', { _profile: profile.id, _target: target });
    setBusy(false);
    if (error) return toast({ variant: 'destructive', description: 'Não foi possível excluir o perfil.' });
    toast({ description: 'Perfil excluído.' });
    onDone();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir "{profile.name}"</DialogTitle>
          <DialogDescription>
            {count > 0 ? `${count} usuário(s) usam este perfil. Escolha para qual perfil eles vão.` : 'Escolha o perfil de destino para convites e usuários inativos.'}
          </DialogDescription>
        </DialogHeader>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger><SelectValue placeholder="Perfil de destino" /></SelectTrigger>
          <SelectContent>{options.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={!target || busy} onClick={run}>Excluir e mover</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
