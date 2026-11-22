// Editor da régua: gatilho, o que fazer quando o lead responde e os passos.
// Mudanças nos passos valem para quem entrar na régua depois; quem já está segue o que foi agendado
// (o template e as variáveis são lidos na hora do envio).
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, TrashSimple } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineInput } from '@/components/ui/inline-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uiText } from '@/lib/ui-locale';
import { CadencePreview } from './CadencePreview';
import { useTokenOptions } from './useTokenOptions';

export interface CadenceRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: 'stage_entered' | 'manual' | 'field_value';
  trigger_stage_id: string | null;
  trigger_field_id?: string | null;
  trigger_field_value?: string | null;
  on_reply: 'cancel' | 'pause' | 'continue';
  exit_on_stage_change: boolean;
}

interface StepDraft {
  id?: string;
  key: string;
  delay_value: number;
  delay_unit: 'minutes' | 'hours' | 'days';
  kind: 'whatsapp_template' | 'task' | 'email';
  template_id: string | null;
  email_template_id: string | null;
  template_variables: Record<string, string>;
  task_title: string;
  task_description: string;
  task_due_hours: number;
  task_priority: 'low' | 'medium' | 'high';
  is_marketing: boolean;
  ignore_send_window: boolean;
  timing: 'after_enrollment' | 'field_date';
  timing_field_id: string | null;
  timing_days: number;
  timing_direction: 'before' | 'after' | 'same';
  timing_time: string;
  cond_field_id: string | null;
  cond_operator: 'equals' | 'not_equals' | 'is_empty' | 'is_filled';
  cond_value: string;
}

interface FieldDef { id: string; label: string | null; name: string; module: string; field_type: string; options: { options?: Array<{ label?: string; value?: string }> } | null }

interface TemplateRow { id: string; friendly_name: string | null; meta_template_name: string | null; body: string | null; category: string | null }

// Mesma lista de _shared/cadence-variables.ts (CADENCE_VARIABLE_TOKENS).
export const TOKENS = [
  { token: '{{contact.first_name}}', label: 'Primeiro nome do contato' },
  { token: '{{contact.full_name}}', label: 'Nome completo do contato' },
  { token: '{{contact.email}}', label: 'E-mail do contato' },
  { token: '{{opportunity.title}}', label: 'Título da oportunidade' },
  { token: '{{opportunity.amount}}', label: 'Valor da oportunidade' },
  { token: '{{owner.first_name}}', label: 'Primeiro nome do responsável' },
  { token: '{{owner.full_name}}', label: 'Nome do responsável' },
  { token: '{{org.name}}', label: 'Nome da organização' },
];

const UNIT_MIN = { minutes: 1, hours: 60, days: 1440 } as const;
const toDelay = (minutes: number): Pick<StepDraft, 'delay_value' | 'delay_unit'> =>
  minutes > 0 && minutes % 1440 === 0 ? { delay_value: minutes / 1440, delay_unit: 'days' }
  : minutes > 0 && minutes % 60 === 0 ? { delay_value: minutes / 60, delay_unit: 'hours' }
  : { delay_value: minutes, delay_unit: 'minutes' };

const newKey = () => Math.random().toString(36).slice(2);
const blankStep = (): StepDraft => ({
  key: newKey(), delay_value: 0, delay_unit: 'days', kind: 'whatsapp_template', template_id: null, email_template_id: null, template_variables: {},
  task_title: '', task_description: '', task_due_hours: 4, task_priority: 'medium', is_marketing: false, ignore_send_window: false,
  timing: 'after_enrollment', timing_field_id: null, timing_days: 1, timing_direction: 'before', timing_time: '09:00',
  cond_field_id: null, cond_operator: 'equals', cond_value: '',
});

const fieldLabel = (f: FieldDef) => `${f.label || f.name} (${f.module === 'contacts' ? 'contato' : 'oportunidade'})`;

/** Valor de um campo: lista de opções (seleção) ou texto livre. */
function FieldValueInput({ field, value, onChange, placeholder }: { field: FieldDef | undefined; value: string; onChange: (v: string) => void; placeholder: string }) {
  const opts = field?.options?.options ?? [];
  if (field && (field.field_type === 'select' || field.field_type === 'multiselect') && opts.length) {
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-44"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{opts.map((o) => <SelectItem key={o.value ?? o.label} value={(o.value ?? o.label)!}>{o.label ?? o.value}</SelectItem>)}</SelectContent>
      </Select>
    );
  }
  return <InlineInput className="h-8 w-44" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

/** Variáveis do template, na ordem em que aparecem no texto ({{1}}, {{2}} ou nomes). */
export function templateVariableKeys(body: string | null | undefined): string[] {
  const keys: string[] = [];
  for (const m of (body ?? '').matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) if (!keys.includes(m[1])) keys.push(m[1]);
  return keys;
}

export function CadenceEditorDialog({ organizationId, cadence, onClose, onSaved }: {
  organizationId: string;
  cadence: CadenceRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(cadence?.name ?? '');
  const [description, setDescription] = useState(cadence?.description ?? '');
  const [triggerType, setTriggerType] = useState<CadenceRow['trigger_type']>(cadence?.trigger_type ?? 'stage_entered');
  const [stageId, setStageId] = useState<string | null>(cadence?.trigger_stage_id ?? null);
  const [triggerFieldId, setTriggerFieldId] = useState<string | null>(cadence?.trigger_field_id ?? null);
  const [triggerFieldValue, setTriggerFieldValue] = useState<string>(cadence?.trigger_field_value ?? '');
  const [onReply, setOnReply] = useState<CadenceRow['on_reply']>(cadence?.on_reply ?? 'cancel');
  const [exitOnStage, setExitOnStage] = useState(cadence?.exit_on_stage_change ?? true);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [loadedSteps, setLoadedSteps] = useState(!cadence);
  const [saving, setSaving] = useState(false);
  const tokenOptions = useTokenOptions(organizationId);

  const { data: fields } = useQuery({
    queryKey: ['cadence-fields', organizationId],
    queryFn: async () => {
      const { data } = await supabase.from('custom_field_definitions').select('id, label, name, module, field_type, options')
        .eq('organization_id', organizationId).order('order_index');
      return (data ?? []) as unknown as FieldDef[];
    },
  });
  const fieldById = useMemo(() => new Map((fields ?? []).map((f) => [f.id, f])), [fields]);
  const dateFields = (fields ?? []).filter((f) => f.field_type === 'date');

  const { data: stages } = useQuery({
    queryKey: ['cadence-stages', organizationId],
    queryFn: async () => {
      const { data } = await supabase.from('pipeline_stages').select('id, name, type, order_index')
        .eq('organization_id', organizationId).order('order_index');
      return (data ?? []).filter((s) => s.type === 'custom');
    },
  });
  const { data: templates } = useQuery({
    queryKey: ['cadence-templates', organizationId],
    queryFn: async () => {
      // Só templates que algum WhatsApp comercial ativo da org consegue mandar (mesmo provedor e integração).
      const [{ data }, { data: endpoints }] = await Promise.all([
        supabase.from('whatsapp_templates')
          .select('id, friendly_name, meta_template_name, body, category, provider, organization_integration_id')
          .eq('organization_id', organizationId).eq('status', 'approved').neq('is_active', false)
          .order('friendly_name'),
        supabase.from('communication_endpoints')
          .select('provider, organization_integration_id')
          .eq('organization_id', organizationId).eq('is_active', true).eq('channel', 'whatsapp').eq('purpose', 'commercial'),
      ]);
      const eps = (endpoints ?? []) as Array<{ provider: string | null; organization_integration_id: string | null }>;
      return ((data ?? []) as Array<TemplateRow & { provider: string | null; organization_integration_id: string | null }>)
        .filter((t) => eps.some((e) => e.provider === t.provider
          && (!t.organization_integration_id || e.organization_integration_id === t.organization_integration_id)));
    },
  });
  const templateById = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t])), [templates]);
  const { data: emailTemplates } = useQuery({
    queryKey: ['cadence-email-templates', organizationId],
    queryFn: async () => {
      const [{ data }, { data: settings }] = await Promise.all([
        supabase.from('email_templates' as never).select('id, name, subject, is_marketing')
          .eq('organization_id', organizationId).is('deleted_at', null).order('name'),
        supabase.from('organization_email_settings' as never).select('status, from_email').eq('organization_id', organizationId).maybeSingle(),
      ]);
      const st = settings as unknown as { status?: string; from_email?: string | null } | null;
      return { list: (data ?? []) as unknown as Array<{ id: string; name: string; subject: string; is_marketing: boolean }>, ready: st?.status === 'connected' && !!st?.from_email };
    },
  });

  useEffect(() => {
    if (!cadence) { setSteps([blankStep()]); return; }
    (async () => {
      const { data } = await supabase.from('cadence_steps' as never)
        .select('id, position, delay_minutes, kind, template_id, email_template_id, template_variables, task_title, task_description, task_due_minutes, task_priority, is_marketing, ignore_send_window, timing, timing_field_id, timing_offset_minutes, timing_local_time, condition')
        .eq('cadence_id', cadence.id).order('position');
      setSteps(((data ?? []) as unknown as Array<Record<string, any>>).map((s) => ({
        id: s.id, key: newKey(), ...toDelay(s.delay_minutes), kind: s.kind, template_id: s.template_id, email_template_id: s.email_template_id ?? null,
        template_variables: (s.template_variables ?? {}) as Record<string, string>,
        task_title: s.task_title ?? '', task_description: s.task_description ?? '',
        task_due_hours: Math.round((s.task_due_minutes ?? 240) / 60), task_priority: s.task_priority ?? 'medium',
        is_marketing: !!s.is_marketing, ignore_send_window: !!s.ignore_send_window,
        timing: s.timing === 'field_date' ? 'field_date' : 'after_enrollment', timing_field_id: s.timing_field_id ?? null,
        timing_days: Math.abs(Math.round((s.timing_offset_minutes ?? 0) / 1440)) || 1,
        timing_direction: (s.timing_offset_minutes ?? 0) === 0 ? 'same' : (s.timing_offset_minutes < 0 ? 'before' : 'after'),
        timing_time: String(s.timing_local_time ?? '09:00').slice(0, 5),
        cond_field_id: s.condition?.field_definition_id ?? null, cond_operator: s.condition?.operator ?? 'equals', cond_value: s.condition?.value ?? '',
      })));
      setLoadedSteps(true);
    })();
  }, [cadence]);

  const update = (key: string, patch: Partial<StepDraft>) => setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => setSteps((prev) => {
    const next = [...prev]; const j = i + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const problems = (): string | null => {
    if (!name.trim()) return 'Dê um nome à régua.';
    if (triggerType === 'stage_entered' && !stageId) return 'Escolha a etapa que dispara a régua.';
    if (triggerType === 'field_value' && !triggerFieldId) return 'Escolha o campo que dispara a régua.';
    if (steps.length === 0) return 'Adicione pelo menos um passo.';
    for (const [i, s] of steps.entries()) {
      if (s.timing === 'field_date' && !s.timing_field_id) return `Passo ${i + 1}: escolha o campo de data.`;
      if (s.cond_field_id && (s.cond_operator === 'equals' || s.cond_operator === 'not_equals') && !s.cond_value.trim()) return `Passo ${i + 1}: escolha o valor da condição.`;
      if (s.kind === 'whatsapp_template') {
        if (!s.template_id) return `Passo ${i + 1}: escolha o template.`;
        const keys = templateVariableKeys(templateById.get(s.template_id)?.body);
        const empty = keys.filter((k) => !(s.template_variables[k] ?? '').trim());
        if (empty.length) return `Passo ${i + 1}: preencha a variável ${empty.map((k) => `{{${k}}}`).join(', ')}.`;
      } else if (s.kind === 'email') {
        if (!s.email_template_id) return `Passo ${i + 1}: escolha o modelo de e-mail.`;
      } else if (!s.task_title.trim()) return `Passo ${i + 1}: dê um título à tarefa.`;
    }
    return null;
  };

  const save = async () => {
    const problem = problems();
    if (problem) { toast.error(uiText(problem)); return; }
    setSaving(true);
    try {
      const cadencePayload = {
        organization_id: organizationId, name: name.trim(), description: description.trim() || null,
        trigger_type: triggerType, trigger_stage_id: triggerType === 'stage_entered' ? stageId : null,
        trigger_field_id: triggerType === 'field_value' ? triggerFieldId : null,
        trigger_field_value: triggerType === 'field_value' ? (triggerFieldValue.trim() || null) : null,
        on_reply: onReply, exit_on_stage_change: exitOnStage,
      };
      let cadenceId = cadence?.id;
      if (cadenceId) {
        const { error } = await supabase.from('cadences' as never).update(cadencePayload as never).eq('id', cadenceId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('cadences' as never).insert(cadencePayload as never).select('id').single();
        if (error) throw error;
        cadenceId = (data as unknown as { id: string }).id;
      }

      const keepIds = steps.map((s) => s.id).filter(Boolean) as string[];
      if (cadence) {
        let del = supabase.from('cadence_steps' as never).delete().eq('cadence_id', cadenceId!);
        if (keepIds.length) del = del.not('id', 'in', `(${keepIds.join(',')})`);
        const { error } = await del;
        if (error) throw error;
      }
      for (const [i, s] of steps.entries()) {
        const keys = s.kind === 'whatsapp_template' ? templateVariableKeys(templateById.get(s.template_id ?? '')?.body) : [];
        const row = {
          organization_id: organizationId, cadence_id: cadenceId, position: i,
          delay_minutes: Math.max(0, Math.round(s.delay_value * UNIT_MIN[s.delay_unit])),
          kind: s.kind,
          template_id: s.kind === 'whatsapp_template' ? s.template_id : null,
          email_template_id: s.kind === 'email' ? s.email_template_id : null,
          template_variables: Object.fromEntries(keys.map((k) => [k, s.template_variables[k] ?? ''])),
          task_title: s.kind === 'task' ? s.task_title.trim() : null,
          task_description: s.kind === 'task' ? (s.task_description.trim() || null) : null,
          task_due_minutes: Math.max(0, Math.round(s.task_due_hours * 60)),
          task_priority: s.task_priority,
          is_marketing: s.kind === 'whatsapp_template' ? s.is_marketing : s.kind === 'email' ? !!emailTemplates?.list.find((t) => t.id === s.email_template_id)?.is_marketing : false,
          ignore_send_window: s.ignore_send_window,
          timing: s.timing,
          timing_field_id: s.timing === 'field_date' ? s.timing_field_id : null,
          timing_offset_minutes: s.timing === 'field_date' ? (s.timing_direction === 'same' ? 0 : (s.timing_direction === 'before' ? -1 : 1) * Math.round(s.timing_days * 1440)) : 0,
          timing_local_time: /^\d{2}:\d{2}$/.test(s.timing_time) ? s.timing_time : '09:00',
          condition: s.cond_field_id ? { field_definition_id: s.cond_field_id, operator: s.cond_operator, value: s.cond_value.trim() } : null,
        };
        const { error } = s.id
          ? await supabase.from('cadence_steps' as never).update(row as never).eq('id', s.id)
          : await supabase.from('cadence_steps' as never).insert(row as never);
        if (error) throw error;
      }
      toast.success(uiText('Régua salva'));
      onSaved();
    } catch (e) {
      console.error('[cadences] save', e);
      toast.error(uiText('Não foi possível salvar a régua. Só administradores editam réguas.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{cadence ? uiText('Editar régua') : uiText('Nova régua')}</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{uiText('Nome')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={uiText('Ex.: Proposta enviada')} />
          </div>
          <div className="space-y-1">
            <Label>{uiText('Descrição (opcional)')}</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{uiText('Começa quando')}</Label>
              <Select value={triggerType} onValueChange={(v) => setTriggerType(v as CadenceRow['trigger_type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stage_entered">{uiText('A oportunidade entra numa etapa')}</SelectItem>
                  <SelectItem value="field_value">{uiText('Um campo recebe um valor')}</SelectItem>
                  <SelectItem value="manual">{uiText('Alguém inscreve pela oportunidade')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {triggerType === 'stage_entered' && (
              <div className="space-y-1">
                <Label>{uiText('Etapa')}</Label>
                <Select value={stageId ?? undefined} onValueChange={setStageId}>
                  <SelectTrigger><SelectValue placeholder={uiText('Escolha a etapa')} /></SelectTrigger>
                  <SelectContent>
                    {(stages ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {triggerType === 'field_value' && (
              <div className="space-y-1">
                <Label>{uiText('Campo e valor')}</Label>
                <div className="flex flex-wrap gap-2">
                  <Select value={triggerFieldId ?? undefined} onValueChange={(v) => { setTriggerFieldId(v); setTriggerFieldValue(''); }}>
                    <SelectTrigger className="h-8 w-48"><SelectValue placeholder={uiText('Campo')} /></SelectTrigger>
                    <SelectContent>{(fields ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{fieldLabel(f)}</SelectItem>)}</SelectContent>
                  </Select>
                  <FieldValueInput field={triggerFieldId ? fieldById.get(triggerFieldId) : undefined} value={triggerFieldValue}
                    onChange={setTriggerFieldValue} placeholder={uiText('Qualquer valor')} />
                </div>
                <p className="text-xs text-muted-foreground">{uiText('Em branco: qualquer valor.')}</p>
              </div>
            )}
            <div className="space-y-1">
              <Label>{uiText('Quando o lead responde')}</Label>
              <Select value={onReply} onValueChange={(v) => setOnReply(v as CadenceRow['on_reply'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cancel">{uiText('Encerra a régua')}</SelectItem>
                  <SelectItem value="pause">{uiText('Pausa até alguém retomar')}</SelectItem>
                  <SelectItem value="continue">{uiText('Continua normalmente')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <Label htmlFor="exit-stage" className="text-sm font-normal">{uiText('Encerra se a oportunidade mudar de etapa')}</Label>
              <Switch id="exit-stage" checked={exitOnStage} onCheckedChange={setExitOnStage} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {uiText('Ganhar, perder ou "não contatar" sempre encerra. Entrar numa régua nova encerra a anterior.')}
          </p>

          <div className="space-y-3">
            <Label>{uiText('Passos')}</Label>
            {!loadedSteps && <p className="text-sm text-muted-foreground">{uiText('Carregando...')}</p>}
            {steps.map((s, i) => {
              const tpl = s.template_id ? templateById.get(s.template_id) : undefined;
              const varKeys = templateVariableKeys(tpl?.body);
              return (
                <div key={s.key} className="space-y-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{uiText('Passo')} {i + 1}</span>
                    <Select value={s.timing} onValueChange={(v) => update(s.key, { timing: v as StepDraft['timing'] })}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="after_enrollment">{uiText('Depois da entrada')}</SelectItem>
                        <SelectItem value="field_date" disabled={dateFields.length === 0}>{uiText('Por uma data')}</SelectItem>
                      </SelectContent>
                    </Select>
                    {s.timing === 'after_enrollment' ? (
                      <>
                        <InlineInput type="number" min={0} className="h-8 w-20" value={s.delay_value}
                          onChange={(e) => update(s.key, { delay_value: Math.max(0, Number(e.target.value) || 0) })} />
                        <Select value={s.delay_unit} onValueChange={(v) => update(s.key, { delay_unit: v as StepDraft['delay_unit'] })}>
                          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">{uiText('minutos')}</SelectItem>
                            <SelectItem value="hours">{uiText('horas')}</SelectItem>
                            <SelectItem value="days">{uiText('dias')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </>
                    ) : (
                      <>
                        {s.timing_direction !== 'same' && (
                          <InlineInput type="number" min={1} className="h-8 w-16" value={s.timing_days}
                            onChange={(e) => update(s.key, { timing_days: Math.max(1, Number(e.target.value) || 1) })} />
                        )}
                        <Select value={s.timing_direction} onValueChange={(v) => update(s.key, { timing_direction: v as StepDraft['timing_direction'] })}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="before">{uiText('dias antes de')}</SelectItem>
                            <SelectItem value="same">{uiText('no dia de')}</SelectItem>
                            <SelectItem value="after">{uiText('dias depois de')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={s.timing_field_id ?? undefined} onValueChange={(v) => update(s.key, { timing_field_id: v })}>
                          <SelectTrigger className="h-8 w-44"><SelectValue placeholder={uiText('Campo de data')} /></SelectTrigger>
                          <SelectContent>{dateFields.map((f) => <SelectItem key={f.id} value={f.id}>{fieldLabel(f)}</SelectItem>)}</SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">{uiText('às')}</span>
                        <InlineInput type="time" className="h-8 w-24" value={s.timing_time} onChange={(e) => update(s.key, { timing_time: e.target.value })} />
                      </>
                    )}
                    <div className="ml-auto flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSteps((p) => p.filter((x) => x.key !== s.key))}><TrashSimple className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </div>

                  <Select value={s.kind} onValueChange={(v) => update(s.key, { kind: v as StepDraft['kind'] })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp_template">{uiText('Enviar template de WhatsApp')}</SelectItem>
                      <SelectItem value="email">{uiText('Enviar e-mail')}</SelectItem>
                      <SelectItem value="task">{uiText('Criar tarefa para o responsável')}</SelectItem>
                    </SelectContent>
                  </Select>

                  {s.kind === 'whatsapp_template' ? (
                    <div className="space-y-2">
                      <Select value={s.template_id ?? undefined} onValueChange={(v) => update(s.key, { template_id: v, template_variables: {} })}>
                        <SelectTrigger className="h-9"><SelectValue placeholder={uiText('Escolha um template aprovado')} /></SelectTrigger>
                        <SelectContent>
                          {(templates ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.friendly_name || t.meta_template_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {(templates ?? []).length === 0 && (
                        <p className="text-xs text-muted-foreground">{uiText('Nenhum template aprovado para o seu número de WhatsApp.')}</p>
                      )}
                      {tpl?.body && <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">{tpl.body}</p>}
                      {varKeys.map((k) => (
                        <div key={k} className="flex flex-wrap items-center gap-2">
                          <span className="w-14 font-mono text-xs">{`{{${k}}}`}</span>
                          <InlineInput className="h-8 min-w-[180px] flex-1 text-sm" value={s.template_variables[k] ?? ''}
                            placeholder={uiText('Texto ou campo')}
                            onChange={(e) => update(s.key, { template_variables: { ...s.template_variables, [k]: e.target.value } })} />
                          <Select value="" onValueChange={(tok) => update(s.key, { template_variables: { ...s.template_variables, [k]: `${s.template_variables[k] ?? ''}${tok}` } })}>
                            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder={uiText('Inserir campo')} /></SelectTrigger>
                            <SelectContent>
                              {tokenOptions.map((t) => <SelectItem key={t.token} value={t.token}>{uiText(t.label)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                      {varKeys.length > 0 && (
                        <p className="text-xs text-muted-foreground">{uiText('Se o campo estiver vazio na hora, o passo não sai.')}</p>
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={s.is_marketing} onCheckedChange={(v) => update(s.key, { is_marketing: v === true })} />
                        {uiText('É marketing (só para quem aceitou receber)')}
                      </label>
                    </div>
                  ) : s.kind === 'email' ? (
                    <div className="space-y-2">
                      {!emailTemplates?.ready && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">{uiText('O e-mail ainda não está conectado (Integrações → E-mail). Sem isso, este passo não sai.')}</p>
                      )}
                      <Select value={s.email_template_id ?? undefined} onValueChange={(v) => update(s.key, { email_template_id: v })}>
                        <SelectTrigger className="h-9"><SelectValue placeholder={uiText('Escolha um modelo de e-mail')} /></SelectTrigger>
                        <SelectContent>
                          {(emailTemplates?.list ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_marketing ? ` · ${uiText('marketing')}` : ''}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {(emailTemplates?.list ?? []).length === 0 && <p className="text-xs text-muted-foreground">{uiText('Nenhum modelo de e-mail. Crie em Configurações → Modelos de e-mail.')}</p>}
                      <p className="text-xs text-muted-foreground">{uiText('Modelo de marketing só vai para quem aceitou receber.')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input value={s.task_title} placeholder={uiText('Título da tarefa')} onChange={(e) => update(s.key, { task_title: e.target.value })} />
                      <Textarea rows={2} value={s.task_description} placeholder={uiText('Descrição (opcional)')} onChange={(e) => update(s.key, { task_description: e.target.value })} />
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs text-muted-foreground">{uiText('Prazo')}</span>
                        <InlineInput type="number" min={0} className="h-8 w-20" value={s.task_due_hours}
                          onChange={(e) => update(s.key, { task_due_hours: Math.max(0, Number(e.target.value) || 0) })} />
                        <span className="text-xs text-muted-foreground">{uiText('horas')}</span>
                        <Select value={s.task_priority} onValueChange={(v) => update(s.key, { task_priority: v as StepDraft['task_priority'] })}>
                          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">{uiText('Baixa')}</SelectItem>
                            <SelectItem value="medium">{uiText('Média')}</SelectItem>
                            <SelectItem value="high">{uiText('Alta')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-xs text-muted-foreground">{uiText('Só sai se')}</span>
                    <Select value={s.cond_field_id ?? '__always__'} onValueChange={(v) => update(s.key, { cond_field_id: v === '__always__' ? null : v, cond_value: '' })}>
                      <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__always__">{uiText('sempre (sem condição)')}</SelectItem>
                        {(fields ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{fieldLabel(f)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {s.cond_field_id && (
                      <>
                        <Select value={s.cond_operator} onValueChange={(v) => update(s.key, { cond_operator: v as StepDraft['cond_operator'] })}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">{uiText('for igual a')}</SelectItem>
                            <SelectItem value="not_equals">{uiText('for diferente de')}</SelectItem>
                            <SelectItem value="is_filled">{uiText('estiver preenchido')}</SelectItem>
                            <SelectItem value="is_empty">{uiText('estiver vazio')}</SelectItem>
                          </SelectContent>
                        </Select>
                        {(s.cond_operator === 'equals' || s.cond_operator === 'not_equals') && (
                          <FieldValueInput field={fieldById.get(s.cond_field_id)} value={s.cond_value}
                            onChange={(v) => update(s.key, { cond_value: v })} placeholder={uiText('Valor')} />
                        )}
                      </>
                    )}
                  </div>
                  {s.cond_field_id && <p className="text-[11px] text-muted-foreground">{uiText('Use para mandar mensagens diferentes conforme o campo. Vale o valor do campo no momento do envio.')}</p>}
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={s.ignore_send_window} onCheckedChange={(v) => update(s.key, { ignore_send_window: v === true })} />
                    {uiText('Pode sair fora do horário de envio')}
                  </label>
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => setSteps((p) => [...p, blankStep()])}><Plus className="mr-1 h-4 w-4" />{uiText('Adicionar passo')}</Button>
            {cadence?.is_active && (
              <p className="text-xs text-muted-foreground">{uiText('A régua está ligada: mudanças nos tempos e passos valem para quem entrar depois.')}</p>
            )}
          </div>

          <CadencePreview organizationId={organizationId} steps={steps.map((s) => ({
            kind: s.kind, template_id: s.template_id, template_variables: s.template_variables, email_template_id: s.email_template_id,
            task_title: s.task_title,
            condition: s.cond_field_id ? { field_definition_id: s.cond_field_id, operator: s.cond_operator, value: s.cond_value } : null,
          }))} />
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>{uiText('Cancelar')}</Button>
          <Button disabled={saving || !loadedSteps} onClick={save}>{saving ? uiText('Salvando...') : uiText('Salvar')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
