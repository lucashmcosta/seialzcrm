import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { toErrorMessageString } from '@/lib/errorMessage';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Person {
  user_id: string;
  full_name: string;
  has_access: boolean;
  member_active: boolean;
  open_now: number;
  today: number;
  week: number;
  last_at: string | null;
}

/** Aba "Atendimento" de /settings/round-robin — rodízio próprio, separado do Comercial. */
export function CsRoundRobinTab() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [enabled, setEnabled] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('cs_round_robin_overview' as never, { _org: orgId } as never);
    if (error) toast.error(toErrorMessageString(error));
    const d = (data ?? {}) as { enabled?: boolean; people?: Person[] };
    setEnabled(!!d.enabled);
    setPeople(d.people ?? []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const askEnable = async () => {
    if (!orgId) return;
    const { data, error } = await supabase.rpc('cs_round_robin_preview' as never, { _org: orgId } as never);
    if (error) return toast.error(toErrorMessageString(error));
    setConfirm(Number(data ?? 0));
  };

  const doEnable = async () => {
    if (!orgId) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('cs_round_robin_enable' as never, { _org: orgId } as never);
    setBusy(false);
    setConfirm(null);
    if (error) return toast.error(toErrorMessageString(error));
    const r = (data ?? {}) as { returned?: number; round_robin?: number; unassigned?: number };
    toast.success(`Atribuição automática ligada. Devolvidas: ${r.returned ?? 0} · Rodízio: ${r.round_robin ?? 0} · Sem responsável: ${r.unassigned ?? 0}`);
    load();
  };

  const doDisable = async () => {
    if (!orgId) return;
    setBusy(true);
    const { error } = await supabase.rpc('cs_round_robin_disable' as never, { _org: orgId } as never);
    setBusy(false);
    if (error) return toast.error(toErrorMessageString(error));
    load();
  };

  const toggleMember = async (p: Person, value: boolean) => {
    if (!orgId) return;
    setPeople((prev) => prev.map((x) => (x.user_id === p.user_id ? { ...x, member_active: value } : x)));
    const { error } = await supabase
      .from('cs_round_robin_members' as never)
      .upsert({ organization_id: orgId, user_id: p.user_id, active: value } as never, { onConflict: 'organization_id,user_id' });
    if (error) {
      setPeople((prev) => prev.map((x) => (x.user_id === p.user_id ? { ...x, member_active: !value } : x)));
      toast.error(toErrorMessageString(error));
    }
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  }

  const eligible = people.filter((p) => p.has_access);
  const blocked = people.filter((p) => !p.has_access);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="cs-rr" className="text-base">Atribuição automática do Atendimento</Label>
              <p className="text-sm text-muted-foreground">
                Conversas novas vão para quem tem menos atendimentos abertos. Quando o cliente volta a
                falar, a conversa volta para quem já o atendia, se essa pessoa estiver na lista e ativa.
              </p>
            </div>
            <Switch
              id="cs-rr"
              checked={enabled}
              disabled={busy}
              onCheckedChange={(v) => (v ? askEnable() : doDisable())}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Equipe do Atendimento</CardTitle>
          <CardDescription>Desative para pausar, ex.: férias.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {eligible.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">Ninguém com acesso ao Atendimento.</p>
          )}
          {eligible.map((p) => (
            <div key={p.user_id} className="flex items-center justify-between gap-4 p-3 rounded-md border bg-card">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.full_name}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span>Abertas agora: <strong className="text-foreground">{p.open_now}</strong></span>
                  <span>Recebidas hoje: <strong className="text-foreground">{p.today}</strong></span>
                  <span>7 dias: <strong className="text-foreground">{p.week}</strong></span>
                  <span>Último: {p.last_at ? formatDistanceToNow(new Date(p.last_at), { addSuffix: true, locale: ptBR }) : 'nunca'}</span>
                </div>
              </div>
              <Switch checked={p.member_active} onCheckedChange={(v) => toggleMember(p, v)} />
            </div>
          ))}
          {blocked.length > 0 && (
            <div className="pt-4 space-y-1">
              {blocked.map((p) => (
                <p key={p.user_id} className="text-sm text-muted-foreground">
                  {p.full_name} — perfil sem acesso ao Atendimento
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ligar a atribuição automática do Atendimento?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm
                ? `${confirm} conversa(s) de Atendimento aberta(s) estão com pessoas fora da lista. Elas voltarão para quem atendia antes (se estiver na lista), irão para o rodízio ou ficarão sem responsável. Ninguém será notificado e nada será enviado ao cliente.`
                : 'Nenhuma conversa aberta precisa ser redistribuída.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={doEnable}>Ligar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
