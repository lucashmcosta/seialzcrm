import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Navigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrgFlags {
  round_robin_enabled: boolean;
  round_robin_scope: string;
  private_records_enabled: boolean;
}

interface QueueMember {
  uo_id: string;
  user_id: string;
  full_name: string;
  email: string;
  round_robin_active: boolean;
  last_assigned_at: string | null;
  is_recipient: boolean;
  profile_name: string;
  count_today: number;
  count_week: number;
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
      .select('round_robin_enabled, round_robin_scope, private_records_enabled')
      .eq('id', organization.id)
      .single();

    if (org) setFlags(org as OrgFlags);

    const { data: uoData } = await supabase
      .from('user_organizations')
      .select(`
        id, user_id, round_robin_active, last_assigned_at,
        users:user_id ( full_name, email ),
        permission_profiles:permission_profile_id ( name, permissions )
      `)
      .eq('organization_id', organization.id)
      .eq('is_active', true);

    if (uoData) {
      // Compute counts via activities log
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
        return {
          uo_id: u.id,
          user_id: u.user_id,
          full_name: u.users?.full_name || '—',
          email: u.users?.email || '',
          round_robin_active: u.round_robin_active,
          last_assigned_at: u.last_assigned_at,
          is_recipient: !!perms.round_robin_recipient,
          profile_name: u.permission_profiles?.name || '—',
          count_today: c.today,
          count_week: c.week,
        };
      });
      list.sort((a, b) => {
        if (a.is_recipient !== b.is_recipient) return a.is_recipient ? -1 : 1;
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

  const toggleMember = async (uoId: string, value: boolean) => {
    const { error } = await supabase
      .from('user_organizations')
      .update({ round_robin_active: value })
      .eq('id', uoId);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setMembers((prev) => prev.map((m) => (m.uo_id === uoId ? { ...m, round_robin_active: value } : m)));
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
          Distribua novos leads entre seu time de forma justa e configure a privacidade dos registros.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configurações da organização</CardTitle>
          <CardDescription>Controle global para todos os usuários.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="rr-enabled" className="text-base">Atribuição automática (round-robin)</Label>
              <p className="text-sm text-muted-foreground">
                Distribui novos contatos e conversas alternando entre os vendedores ativos.
              </p>
            </div>
            <Switch
              id="rr-enabled"
              checked={flags.round_robin_enabled}
              onCheckedChange={(v) => updateFlag('round_robin_enabled', v)}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-base">Escopo da atribuição</Label>
            <Select
              value={flags.round_robin_scope}
              onValueChange={(v) => updateFlag('round_robin_scope', v)}
              disabled={saving || !flags.round_robin_enabled}
            >
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="threads_and_contacts">Contatos e conversas</SelectItem>
                <SelectItem value="contacts_only">Apenas contatos</SelectItem>
                <SelectItem value="threads_only">Apenas conversas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="space-y-0.5">
              <Label htmlFor="priv-enabled" className="text-base">Privacidade de registros</Label>
              <p className="text-sm text-muted-foreground">
                Cada vendedor vê apenas seus próprios contatos, oportunidades e conversas. Admins e gestores continuam vendo tudo.
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
          <CardTitle className="text-lg">Fila de atribuição</CardTitle>
          <CardDescription>
            Apenas usuários com permissão "round_robin_recipient" no perfil aparecem como elegíveis.
            Pause alguém em férias sem precisar desativar a conta.
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{m.full_name}</p>
                    <Badge variant="outline" className="text-xs">{m.profile_name}</Badge>
                    {!m.is_recipient && (
                      <Badge variant="secondary" className="text-xs">Não recebe leads</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{m.email}</p>
                  {m.is_recipient && (
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
                  checked={m.round_robin_active}
                  onCheckedChange={(v) => toggleMember(m.uo_id, v)}
                  disabled={!m.is_recipient}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
