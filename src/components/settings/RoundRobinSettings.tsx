import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Navigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrgFlags {
  round_robin_enabled: boolean;
  private_records_enabled: boolean;
}

interface QueueMember {
  uo_id: string;
  user_id: string;
  full_name: string;
  email: string;
  receives_leads: boolean; // combined: is_recipient AND round_robin_active
  last_assigned_at: string | null;
  count_today: number;
  count_week: number;
  profile_id: string;
  profile_name: string;
  profile_permissions: any;
}

export function RoundRobinSettings() {
  const { organization } = useOrganization();
  const { permissions, loading: permLoading } = usePermissions();
  const { toast } = useToast();
  const [flags, setFlags] = useState<OrgFlags | null>(null);
  const [members, setMembers] = useState<QueueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    if (!organization) return;
    setLoading(true);

    const { data: org } = await supabase
      .from('organizations')
      .select('round_robin_enabled, private_records_enabled')
      .eq('id', organization.id)
      .single();

    if (org) setFlags(org as OrgFlags);

    const { data: uoData } = await supabase
      .from('user_organizations')
      .select(`
        id, user_id, round_robin_active, last_assigned_at, permission_profile_id,
        users:user_id ( full_name, email ),
        permission_profiles:permission_profile_id ( name, permissions )
      `)
      .eq('organization_id', organization.id)
      .eq('is_active', true);

    if (uoData) {
      const userIds = uoData.map((u: any) => u.user_id);
      const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
      const sinceToday = new Date();
      sinceToday.setHours(0, 0, 0, 0);

      const { data: activities } = await supabase
        .from('contacts')
        .select('owner_user_id, created_at')
        .eq('organization_id', organization.id)
        .in('owner_user_id', userIds)
        .gte('created_at', since7d);

      const counts = new Map<string, { today: number; week: number }>();
      (activities || []).forEach((a: any) => {
        const c = counts.get(a.owner_user_id) || { today: 0, week: 0 };
        c.week++;
        if (new Date(a.created_at) >= sinceToday) c.today++;
        counts.set(a.owner_user_id, c);
      });

      const list: QueueMember[] = uoData.map((u: any) => {
        const perms = u.permission_profiles?.permissions || {};
        const c = counts.get(u.user_id) || { today: 0, week: 0 };
        const isRecipient = !!perms.round_robin_recipient;
        return {
          uo_id: u.id,
          user_id: u.user_id,
          full_name: u.users?.full_name || '—',
          email: u.users?.email || '',
          receives_leads: isRecipient && u.round_robin_active,
          last_assigned_at: u.last_assigned_at,
          count_today: c.today,
          count_week: c.week,
          profile_id: u.permission_profile_id,
          profile_name: u.permission_profiles?.name || '—',
          profile_permissions: perms,
        };
      });
      list.sort((a, b) => {
        if (a.receives_leads !== b.receives_leads) return a.receives_leads ? -1 : 1;
        return a.full_name.localeCompare(b.full_name);
      });
      setMembers(list);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [organization?.id]);

  if (!permLoading && !permissions.manageAssignments) {
    return <Navigate to="/settings" replace />;
  }

  const updateFlag = async (key: keyof OrgFlags, value: any) => {
    if (!organization || !flags) return;
    setSaving(true);
    const { error } = await supabase
      .from('organizations')
      .update({ [key]: value })
      .eq('id', organization.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    setFlags({ ...flags, [key]: value });
    toast({ title: 'Configuração atualizada' });
  };

  const toggleReceivesLeads = async (member: QueueMember, value: boolean) => {
    // Optimistic update
    setMembers((prev) => prev.map((m) => (m.uo_id === member.uo_id ? { ...m, receives_leads: value } : m)));

    try {
      // 1) Ensure profile has round_robin_recipient flag matching the toggle
      const currentPerms = member.profile_permissions || {};
      if (!!currentPerms.round_robin_recipient !== value) {
        const newPerms = { ...currentPerms, round_robin_recipient: value };
        const { error: profErr } = await supabase
          .from('permission_profiles')
          .update({ permissions: newPerms })
          .eq('id', member.profile_id);
        if (profErr) throw profErr;
      }

      // 2) Toggle queue active state
      const { error: uoErr } = await supabase
        .from('user_organizations')
        .update({ round_robin_active: value })
        .eq('id', member.uo_id);
      if (uoErr) throw uoErr;

      // Update local profile_permissions cache
      setMembers((prev) =>
        prev.map((m) =>
          m.uo_id === member.uo_id
            ? { ...m, profile_permissions: { ...m.profile_permissions, round_robin_recipient: value } }
            : m
        )
      );
    } catch (e: any) {
      // Revert
      setMembers((prev) => prev.map((m) => (m.uo_id === member.uo_id ? { ...m, receives_leads: !value } : m)));
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  if (loading || !flags) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Atribuição automática</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Distribua novos leads entre seu time e configure a privacidade dos registros.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configurações da organização</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="rr-enabled" className="text-base">Atribuição automática (round-robin)</Label>
              <p className="text-sm text-muted-foreground">
                Distribui novos contatos e conversas alternando entre os usuários selecionados abaixo.
              </p>
            </div>
            <Switch
              id="rr-enabled"
              checked={flags.round_robin_enabled}
              onCheckedChange={(v) => updateFlag('round_robin_enabled', v)}
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="priv-enabled" className="text-base">Privacidade de registros</Label>
              <p className="text-sm text-muted-foreground">
                Cada usuário vê apenas seus próprios contatos, oportunidades e conversas. Admins continuam vendo tudo.
              </p>
            </div>
            <Switch
              id="priv-enabled"
              checked={flags.private_records_enabled}
              onCheckedChange={(v) => updateFlag('private_records_enabled', v)}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quem recebe leads</CardTitle>
          <CardDescription>
            Ative para incluir o usuário na rotação. Desative para pausar (ex: férias) sem desativar a conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum usuário ativo na organização.</p>
            )}
            {members.map((m) => (
              <div
                key={m.uo_id}
                className="flex items-center justify-between gap-4 p-3 rounded-md border bg-card"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{m.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{m.email}</p>
                  {m.receives_leads && (
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>Hoje: <strong className="text-foreground">{m.count_today}</strong></span>
                      <span>7 dias: <strong className="text-foreground">{m.count_week}</strong></span>
                      <span>
                        Último: {m.last_assigned_at
                          ? formatDistanceToNow(new Date(m.last_assigned_at), { addSuffix: true, locale: ptBR })
                          : 'nunca'}
                      </span>
                    </div>
                  )}
                </div>
                <Switch
                  checked={m.receives_leads}
                  onCheckedChange={(v) => toggleReceivesLeads(m, v)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
