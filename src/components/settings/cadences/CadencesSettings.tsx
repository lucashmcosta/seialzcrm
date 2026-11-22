// Configurações → Réguas. Regras de envio da org (janela, limites, pausar tudo) e a lista de réguas.
// Vale para qualquer org; só administrador edita (RLS no banco).
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PencilSimple, Plus } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineInput } from '@/components/ui/inline-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { uiText } from '@/lib/ui-locale';
import { CadenceEditorDialog, type CadenceRow } from './CadenceEditorDialog';
import { CadenceReport } from './CadenceReport';

const DAYS: Array<{ iso: string; label: string }> = [
  { iso: '1', label: 'Segunda' }, { iso: '2', label: 'Terça' }, { iso: '3', label: 'Quarta' },
  { iso: '4', label: 'Quinta' }, { iso: '5', label: 'Sexta' }, { iso: '6', label: 'Sábado' }, { iso: '7', label: 'Domingo' },
];
const DEFAULT_WINDOWS: Record<string, [string, string]> = {
  '1': ['09:00', '19:00'], '2': ['09:00', '19:00'], '3': ['09:00', '19:00'], '4': ['09:00', '19:00'], '5': ['09:00', '19:00'], '6': ['09:00', '13:00'],
};

interface SettingsRow {
  send_windows: Record<string, [string, string]>;
  weekly_marketing_limit: number;
  daily_send_limit: number;
  paused: boolean;
}

function SendRulesCard({ organizationId }: { organizationId: string }) {
  const [form, setForm] = useState<SettingsRow | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['cadence-settings', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('organization_cadence_settings' as never)
        .select('send_windows, weekly_marketing_limit, daily_send_limit, paused')
        .eq('organization_id', organizationId).maybeSingle();
      if (error) throw error;
      return (data as unknown as SettingsRow | null) ?? { send_windows: DEFAULT_WINDOWS, weekly_marketing_limit: 2, daily_send_limit: 500, paused: false };
    },
  });
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = async (next: SettingsRow) => {
    setSaving(true);
    const { error } = await supabase.from('organization_cadence_settings' as never)
      .upsert({ organization_id: organizationId, ...next, updated_at: new Date().toISOString() } as never, { onConflict: 'organization_id' });
    setSaving(false);
    if (error) { toast.error(uiText('Não foi possível salvar. Só administradores alteram as regras de envio.')); return false; }
    toast.success(uiText('Regras de envio salvas'));
    return true;
  };

  if (isLoading || !form) return null;
  const setDay = (iso: string, value: [string, string] | null) => {
    const w = { ...form.send_windows };
    if (value) w[iso] = value; else delete w[iso];
    setForm({ ...form, send_windows: w });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{uiText('Regras de envio')}</CardTitle>
        <CardDescription>{uiText('Valem para todas as réguas, no horário da sua empresa.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">{uiText('Pausar todas as réguas')}</p>
            <p className="text-xs text-muted-foreground">{uiText('Nada sai enquanto estiver ligado. Os envios voltam quando desligar.')}</p>
          </div>
          <Switch checked={form.paused} disabled={saving}
            onCheckedChange={async (v) => { const next = { ...form, paused: v }; if (await save(next)) setForm(next); }} />
        </div>

        <div className="space-y-2">
          <Label>{uiText('Janela de envio')}</Label>
          <div className="divide-y rounded-lg border">
            {DAYS.map((d) => {
              const w = form.send_windows[d.iso];
              return (
                <div key={d.iso} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
                  <Switch checked={!!w} onCheckedChange={(v) => setDay(d.iso, v ? ['09:00', '18:00'] : null)} />
                  <span className={`w-20 text-sm ${w ? '' : 'text-muted-foreground'}`}>{uiText(d.label)}</span>
                  {w ? (
                    <div className="flex items-center gap-2">
                      <InlineInput type="time" className="w-28" value={w[0]} onChange={(e) => setDay(d.iso, [e.target.value, w[1]])} />
                      <span className="text-xs text-muted-foreground">{uiText('até')}</span>
                      <InlineInput type="time" className="w-28" value={w[1]} onChange={(e) => setDay(d.iso, [w[0], e.target.value])} />
                    </div>
                  ) : <span className="text-xs text-muted-foreground">{uiText('não envia')}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{uiText('Marketing por contato, por semana')}</Label>
            <Input type="number" min={0} max={50} value={form.weekly_marketing_limit}
              onChange={(e) => setForm({ ...form, weekly_marketing_limit: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} />
            <p className="text-xs text-muted-foreground">{uiText('Mensagens de atendimento não contam.')}</p>
          </div>
          <div className="space-y-1">
            <Label>{uiText('Limite de envios por dia (organização)')}</Label>
            <Input type="number" min={0} max={100000} value={form.daily_send_limit}
              onChange={(e) => setForm({ ...form, daily_send_limit: Math.max(0, Math.min(100000, Number(e.target.value) || 0)) })} />
            <p className="text-xs text-muted-foreground">{uiText('Proteção contra envio em massa por engano.')}</p>
          </div>
        </div>
        <Button disabled={saving} onClick={() => save(form)}>{uiText('Salvar regras')}</Button>
      </CardContent>
    </Card>
  );
}

export function CadencesSettings() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CadenceRow | 'new' | null>(null);
  const orgId = organization?.id;

  const { data: cadences } = useQuery({
    queryKey: ['cadences', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('cadences' as never)
        .select('id, name, description, is_active, trigger_type, trigger_stage_id, trigger_field_id, trigger_field_value, on_reply, exit_on_stage_change, created_at, pipeline_stages:trigger_stage_id(name), custom_field_definitions:trigger_field_id(label, name)')
        .eq('organization_id', orgId!).is('deleted_at', null).order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as Array<CadenceRow & { pipeline_stages: { name: string } | null; custom_field_definitions: { label: string | null; name: string } | null }>;
    },
  });
  const { data: liveCounts } = useQuery({
    queryKey: ['cadence-live-counts', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('cadence_enrollments' as never)
        .select('cadence_id').eq('organization_id', orgId!).in('status', ['active', 'paused']).limit(5000);
      const counts: Record<string, number> = {};
      for (const r of (data ?? []) as unknown as Array<{ cadence_id: string }>) counts[r.cadence_id] = (counts[r.cadence_id] ?? 0) + 1;
      return counts;
    },
  });

  const toggleActive = async (c: CadenceRow, active: boolean) => {
    if (active && c.trigger_type === 'stage_entered' && !c.trigger_stage_id) {
      toast.error(uiText('Escolha a etapa que dispara a régua antes de ligar.'));
      return;
    }
    if (active && c.trigger_type === 'field_value' && !c.trigger_field_id) {
      toast.error(uiText('Escolha o campo que dispara a régua antes de ligar.'));
      return;
    }
    if (active) {
      const { count } = await supabase.from('cadence_steps' as never).select('id', { count: 'exact', head: true }).eq('cadence_id', c.id);
      if (!count) { toast.error(uiText('A régua precisa de pelo menos um passo.')); return; }
    }
    const { error } = await supabase.from('cadences' as never).update({ is_active: active } as never).eq('id', c.id);
    if (error) { toast.error(uiText('Não foi possível alterar. Só administradores editam réguas.')); return; }
    toast.success(active ? uiText('Régua ligada: vale para quem entrar na etapa a partir de agora') : uiText('Régua desligada: envios pendentes cancelados'));
    queryClient.invalidateQueries({ queryKey: ['cadences', orgId] });
    queryClient.invalidateQueries({ queryKey: ['cadence-live-counts', orgId] });
  };

  if (!orgId) return null;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{uiText('Réguas')}</CardTitle>
            <CardDescription>
              {uiText('Mensagens e tarefas automáticas. Começam quando a oportunidade entra numa etapa e param quando ela avança ou o lead responde.')}
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing('new')}><Plus className="mr-1 h-4 w-4" />{uiText('Nova régua')}</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(cadences ?? []).length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{uiText('Nenhuma régua ainda.')}</p>
          )}
          {(cadences ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  {(liveCounts?.[c.id] ?? 0) > 0 && <Badge variant="outline" className="text-xs">{liveCounts![c.id]} {uiText('em andamento')}</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {c.trigger_type === 'manual'
                    ? uiText('Inscrição manual')
                    : c.trigger_type === 'field_value'
                    ? `${uiText('Campo')} ${c.custom_field_definitions?.label ?? c.custom_field_definitions?.name ?? '?'}${c.trigger_field_value ? ` = ${c.trigger_field_value}` : ` ${uiText('preenchido')}`}`
                    : `${uiText('Entrou na etapa')}: ${c.pipeline_stages?.name ?? uiText('(escolha a etapa)')}`}
                  {' · '}
                  {c.on_reply === 'cancel' ? uiText('resposta encerra') : c.on_reply === 'pause' ? uiText('resposta pausa') : uiText('resposta não muda nada')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(c)}><PencilSimple className="h-4 w-4" /></Button>
                <Switch checked={c.is_active} onCheckedChange={(v) => toggleActive(c, v)} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <CadenceReport organizationId={orgId} />

      <SendRulesCard organizationId={orgId} />

      {editing && (
        <CadenceEditorDialog
          organizationId={orgId}
          cadence={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['cadences', orgId] }); }}
        />
      )}
    </div>
  );
}

export default CadencesSettings;
