// Réguas da oportunidade: inscrições, próximos envios e os botões pausar, retomar e cancelar.
// Some quando a org não tem régua nenhuma e a oportunidade nunca esteve numa.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uiText } from '@/lib/ui-locale';

interface SendRow { id: string; kind: string; status: string; scheduled_at: string; sent_at: string | null; result_reason: string | null; step_id: string | null; cadence_steps: { position: number; task_title: string | null; whatsapp_templates: { friendly_name: string | null; meta_template_name: string | null } | null; email_templates?: { name: string } | null } | null }
interface EnrollmentRow { id: string; status: string; enrolled_at: string; ended_at: string | null; end_reason: string | null; cadences: { name: string } | null; cadence_sends: SendRow[] }

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa', paused: 'Pausada', completed: 'Concluída', cancelled: 'Encerrada',
  pending: 'Agendado', sending: 'Enviando', sent: 'Enviado', skipped: 'Pulado', failed: 'Falhou',
};
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function OpportunityCadences({ organizationId, opportunityId, isOpen, reloadKey }: {
  organizationId: string;
  opportunityId: string;
  isOpen: boolean;
  /** Muda quando a etapa ou o status mudam (a régua pode ter entrado ou saído). */
  reloadKey?: string;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string>('');

  const { data: cadences } = useQuery({
    queryKey: ['org-active-cadences', organizationId],
    queryFn: async () => {
      const { data } = await supabase.from('cadences' as never).select('id, name')
        .eq('organization_id', organizationId).eq('is_active', true).is('deleted_at', null).order('name');
      return (data ?? []) as unknown as Array<{ id: string; name: string }>;
    },
  });
  const { data: enrollments } = useQuery({
    queryKey: ['opportunity-cadences', opportunityId, reloadKey],
    queryFn: async () => {
      const { data, error } = await supabase.from('cadence_enrollments' as never)
        .select('id, status, enrolled_at, ended_at, end_reason, cadences:cadence_id(name), cadence_sends(id, kind, status, scheduled_at, sent_at, result_reason, step_id, cadence_steps:step_id(position, task_title, whatsapp_templates:template_id(friendly_name, meta_template_name), email_templates:email_template_id(name)))')
        .eq('opportunity_id', opportunityId).order('enrolled_at', { ascending: false }).limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as EnrollmentRow[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['opportunity-cadences', opportunityId] });
  const act = async (enrollmentId: string, action: 'pause' | 'resume' | 'cancel') => {
    setBusy(true);
    const { error } = await supabase.rpc('rpc_cadence_enrollment_action_v1' as never, { p_enrollment_id: enrollmentId, p_action: action } as never);
    setBusy(false);
    if (error) { toast.error(uiText('Não foi possível alterar a régua.')); return; }
    refresh();
  };
  const enroll = async () => {
    if (!pick) return;
    setBusy(true);
    const { error } = await supabase.rpc('rpc_cadence_enroll_v1' as never, { p_opportunity_id: opportunityId, p_cadence_id: pick } as never);
    setBusy(false);
    if (error) { toast.error(uiText('Não foi possível inscrever na régua.')); return; }
    setPick('');
    toast.success(uiText('Inscrita na régua'));
    refresh();
  };

  if (!cadences || !enrollments) return null;
  if (cadences.length === 0 && enrollments.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{uiText('Réguas')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {enrollments.length === 0 && <p className="text-sm text-muted-foreground">{uiText('Esta oportunidade não está em nenhuma régua.')}</p>}
        {enrollments.map((e) => {
          const live = e.status === 'active' || e.status === 'paused';
          const sends = [...(e.cadence_sends ?? [])].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
          return (
            <div key={e.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{e.cadences?.name ?? uiText('Régua')}</p>
                <Badge variant={live ? 'default' : 'outline'} className="text-xs">{uiText(STATUS_LABEL[e.status] ?? e.status)}</Badge>
                {!live && e.end_reason && <span className="text-xs text-muted-foreground">{uiText(e.end_reason)}</span>}
                {live && (
                  <div className="ml-auto flex gap-1">
                    {e.status === 'active'
                      ? <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => act(e.id, 'pause')}>{uiText('Pausar')}</Button>
                      : <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => act(e.id, 'resume')}>{uiText('Retomar')}</Button>}
                    <Button size="sm" variant="ghost" className="h-7 text-destructive" disabled={busy} onClick={() => act(e.id, 'cancel')}>{uiText('Cancelar')}</Button>
                  </div>
                )}
              </div>
              <ul className="space-y-1">
                {sends.map((s) => {
                  const label = s.kind === 'task'
                    ? `${uiText('Tarefa')}: ${s.cadence_steps?.task_title ?? ''}`
                    : s.kind === 'email'
                    ? `${uiText('E-mail')}: ${s.cadence_steps?.email_templates?.name ?? uiText('modelo')}`
                    : `WhatsApp: ${s.cadence_steps?.whatsapp_templates?.friendly_name ?? s.cadence_steps?.whatsapp_templates?.meta_template_name ?? uiText('template')}`;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="w-24 text-muted-foreground">{fmt(s.sent_at ?? s.scheduled_at)}</span>
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className={s.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                        {uiText(STATUS_LABEL[s.status] ?? s.status)}{s.result_reason && s.status !== 'sent' ? ` · ${uiText(s.result_reason)}` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {isOpen && cadences.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={pick || undefined} onValueChange={setPick}>
              <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder={uiText('Inscrever numa régua')} /></SelectTrigger>
              <SelectContent>{cadences.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" className="h-8" disabled={!pick || busy} onClick={enroll}>{uiText('Inscrever')}</Button>
            <span className="text-xs text-muted-foreground">{uiText('Entrar numa régua encerra a atual.')}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
