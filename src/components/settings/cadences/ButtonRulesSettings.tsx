// Configurações → Botões do WhatsApp: o que acontece no CRM quando o lead toca num botão de um template.
// Vale para qualquer org; só administrador edita (RLS). Nenhuma ação marca a oportunidade como perdida.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PencilSimple, Plus, TrashSimple } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineInput } from '@/components/ui/inline-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uiText } from '@/lib/ui-locale';
import { templateVariableKeys } from './CadenceEditorDialog';
import { useTokenOptions } from './useTokenOptions';

type ActionType = 'move_stage' | 'set_field' | 'create_task' | 'enroll_cadence' | 'cancel_cadence' | 'set_consent' | 'send_template';
type Action = { type: ActionType; [k: string]: unknown };
interface Rule { id: string; template_id: string | null; button_text: string; counts_as_reply: boolean; actions: Action[]; is_active: boolean }
interface Template { id: string; name: string; body: string | null; buttons: string[] }

const ACTION_LABEL: Record<ActionType, string> = {
  move_stage: 'Mover de etapa',
  set_field: 'Preencher um campo',
  create_task: 'Criar tarefa para o responsável',
  enroll_cadence: 'Inscrever numa régua',
  cancel_cadence: 'Cancelar a régua atual',
  set_consent: 'Mudar o aceite de marketing',
  send_template: 'Enviar um template na hora',
};
const ANY = '__any__';

function useOrgCatalog(orgId: string) {
  return useQuery({
    queryKey: ['button-rules-catalog', orgId],
    queryFn: async () => {
      const [tpl, actions, stages, fields, cadences] = await Promise.all([
        supabase.from('whatsapp_templates').select('id, friendly_name, meta_template_name, body, components')
          .eq('organization_id', orgId).eq('status', 'approved').neq('is_active', false).order('friendly_name'),
        supabase.from('whatsapp_template_actions').select('template_id, type, title'),
        supabase.from('pipeline_stages').select('id, name, type, order_index').eq('organization_id', orgId).order('order_index'),
        supabase.from('custom_field_definitions').select('id, label, name, module, field_type, options').eq('organization_id', orgId).order('order_index'),
        supabase.from('cadences' as never).select('id, name').eq('organization_id', orgId).is('deleted_at', null).order('name'),
      ]);
      const twilioButtons = new Map<string, string[]>();
      for (const a of (actions.data ?? []) as Array<{ template_id: string; type: string; title: string | null }>) {
        if (a.type !== 'quick_reply' || !a.title) continue;
        twilioButtons.set(a.template_id, [...(twilioButtons.get(a.template_id) ?? []), a.title]);
      }
      const templates: Template[] = ((tpl.data ?? []) as Array<Record<string, any>>).map((t) => {
        const metaButtons = (Array.isArray(t.components) ? t.components : [])
          .filter((c: any) => c?.type === 'BUTTONS')
          .flatMap((c: any) => (c.buttons ?? []).filter((b: any) => b?.type === 'QUICK_REPLY' && b.text).map((b: any) => String(b.text)));
        return { id: t.id, name: t.friendly_name || t.meta_template_name || 'template', body: t.body, buttons: [...metaButtons, ...(twilioButtons.get(t.id) ?? [])] };
      });
      return {
        templates,
        stages: ((stages.data ?? []) as Array<{ id: string; name: string; type: string }>).filter((s) => s.type === 'custom'),
        fields: (fields.data ?? []) as Array<{ id: string; label: string | null; name: string; module: string; field_type: string; options: { options?: Array<{ label?: string; value?: string }> } | null }>,
        cadences: (cadences.data ?? []) as unknown as Array<{ id: string; name: string }>,
      };
    },
  });
}

function RuleEditor({ orgId, rule, onClose, onSaved }: { orgId: string; rule: Rule | null; onClose: () => void; onSaved: () => void }) {
  const { data: cat } = useOrgCatalog(orgId);
  const [templateId, setTemplateId] = useState<string>(rule?.template_id ?? ANY);
  const [buttonText, setButtonText] = useState(rule?.button_text ?? '');
  const [countsAsReply, setCountsAsReply] = useState(rule?.counts_as_reply ?? true);
  const [actions, setActions] = useState<Action[]>(rule?.actions ?? []);
  const [saving, setSaving] = useState(false);
  const tokenOptions = useTokenOptions(orgId);
  const tplById = useMemo(() => new Map((cat?.templates ?? []).map((t) => [t.id, t])), [cat]);
  const withButtons = (cat?.templates ?? []).filter((t) => t.buttons.length > 0);
  const tpl = templateId !== ANY ? tplById.get(templateId) : undefined;

  const setAction = (i: number, patch: Record<string, unknown>) => setActions((p) => p.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const save = async () => {
    if (!buttonText.trim()) { toast.error(uiText('Escolha o botão.')); return; }
    for (const a of actions) {
      if (a.type === 'move_stage' && !a.stage_id) return void toast.error(uiText('Escolha a etapa.'));
      if (a.type === 'set_field' && !a.field_definition_id) return void toast.error(uiText('Escolha o campo.'));
      if (a.type === 'create_task' && !String(a.title ?? '').trim()) return void toast.error(uiText('Dê um título à tarefa.'));
      if (a.type === 'enroll_cadence' && !a.cadence_id) return void toast.error(uiText('Escolha a régua.'));
      if (a.type === 'send_template' && !a.template_id) return void toast.error(uiText('Escolha o template a enviar.'));
    }
    setSaving(true);
    const payload = {
      organization_id: orgId, template_id: templateId === ANY ? null : templateId, button_text: buttonText.trim(),
      counts_as_reply: countsAsReply, actions, is_active: rule?.is_active ?? true,
    };
    const { error } = rule
      ? await supabase.from('whatsapp_button_rules' as never).update(payload as never).eq('id', rule.id)
      : await supabase.from('whatsapp_button_rules' as never).insert(payload as never);
    setSaving(false);
    if (error) {
      toast.error(error.code === '23505' ? uiText('Já existe uma regra para esse botão neste template.') : uiText('Não foi possível salvar. Só administradores editam.'));
      return;
    }
    toast.success(uiText('Regra salva'));
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{rule ? uiText('Editar botão') : uiText('Novo botão')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{uiText('Template')}</Label>
            <Select value={templateId} onValueChange={(v) => { setTemplateId(v); setButtonText(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{uiText('Qualquer template (pelo texto do botão)')}</SelectItem>
                {withButtons.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{uiText('Botão')}</Label>
            {tpl ? (
              <Select value={buttonText || undefined} onValueChange={setButtonText}>
                <SelectTrigger><SelectValue placeholder={uiText('Escolha o botão')} /></SelectTrigger>
                <SelectContent>{tpl.buttons.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} placeholder={uiText('Texto do botão, como aparece no WhatsApp')} />
            )}
            <p className="text-xs text-muted-foreground">{uiText('Maiúsculas, acentos e emojis não fazem diferença.')}</p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm">{uiText('Conta como resposta do lead')}</p>
              <p className="text-xs text-muted-foreground">{uiText('Desligado: a régua continua (ex.: "Agora não").')}</p>
            </div>
            <Switch checked={countsAsReply} onCheckedChange={setCountsAsReply} />
          </div>

          <div className="space-y-2">
            <Label>{uiText('Ações, nesta ordem')}</Label>
            {actions.length === 0 && <p className="text-xs text-muted-foreground">{uiText('Sem ação: o toque só aparece na conversa.')}</p>}
            {actions.map((a, i) => {
              const field = a.type === 'set_field' ? cat?.fields.find((f) => f.id === a.field_definition_id) : undefined;
              const sendTpl = a.type === 'send_template' ? tplById.get(String(a.template_id ?? '')) : undefined;
              const vars = (a.variables ?? {}) as Record<string, string>;
              return (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{uiText(ACTION_LABEL[a.type])}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setActions((p) => p.filter((_, j) => j !== i))}><TrashSimple className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                  {a.type === 'move_stage' && (
                    <Select value={(a.stage_id as string) || undefined} onValueChange={(v) => setAction(i, { stage_id: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder={uiText('Etapa')} /></SelectTrigger>
                      <SelectContent>{(cat?.stages ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  {a.type === 'set_field' && (
                    <div className="space-y-2">
                      <Select value={(a.field_definition_id as string) || undefined} onValueChange={(v) => setAction(i, { field_definition_id: v, value: null })}>
                        <SelectTrigger className="h-9"><SelectValue placeholder={uiText('Campo')} /></SelectTrigger>
                        <SelectContent>{(cat?.fields ?? []).map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.label || f.name} ({f.module === 'contacts' ? uiText('contato') : uiText('oportunidade')})</SelectItem>
                        ))}</SelectContent>
                      </Select>
                      {field && field.field_type === 'select' ? (
                        <Select value={(a.value as string) || undefined} onValueChange={(v) => setAction(i, { value: v })}>
                          <SelectTrigger className="h-9"><SelectValue placeholder={uiText('Valor')} /></SelectTrigger>
                          <SelectContent>{(field.options?.options ?? []).map((o) => (
                            <SelectItem key={o.value ?? o.label} value={(o.value ?? o.label)!}>{o.label ?? o.value}</SelectItem>
                          ))}</SelectContent>
                        </Select>
                      ) : field ? (
                        <Input className="h-9" value={(a.value as string) ?? ''} onChange={(e) => setAction(i, { value: e.target.value })} placeholder={uiText('Valor')} />
                      ) : null}
                    </div>
                  )}
                  {a.type === 'create_task' && (
                    <div className="space-y-2">
                      <Input className="h-9" value={(a.title as string) ?? ''} onChange={(e) => setAction(i, { title: e.target.value })} placeholder={uiText('Título da tarefa')} />
                      <Input className="h-9" value={(a.description as string) ?? ''} onChange={(e) => setAction(i, { description: e.target.value })} placeholder={uiText('Descrição (opcional)')} />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">{uiText('Prazo em minutos')}</span>
                        <InlineInput type="number" min={0} className="h-8 w-24" value={Number(a.due_minutes ?? 60)} onChange={(e) => setAction(i, { due_minutes: Math.max(0, Number(e.target.value) || 0) })} />
                        <Select value={(a.priority as string) || 'medium'} onValueChange={(v) => setAction(i, { priority: v })}>
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
                  {a.type === 'enroll_cadence' && (
                    <Select value={(a.cadence_id as string) || undefined} onValueChange={(v) => setAction(i, { cadence_id: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder={uiText('Régua')} /></SelectTrigger>
                      <SelectContent>{(cat?.cadences ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  {a.type === 'set_consent' && (
                    <div className="flex flex-wrap gap-2">
                      <Select value={(a.channel as string) || 'all'} onValueChange={(v) => setAction(i, { channel: v })}>
                        <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{uiText('Todos os canais')}</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="email">E-mail</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={a.granted ? 'yes' : 'no'} onValueChange={(v) => setAction(i, { granted: v === 'yes' })}>
                        <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">{uiText('Não aceita marketing')}</SelectItem>
                          <SelectItem value="yes">{uiText('Aceita marketing')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {a.type === 'send_template' && (
                    <div className="space-y-2">
                      <Select value={(a.template_id as string) || undefined} onValueChange={(v) => setAction(i, { template_id: v, variables: {} })}>
                        <SelectTrigger className="h-9"><SelectValue placeholder={uiText('Template')} /></SelectTrigger>
                        <SelectContent>{(cat?.templates ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                      </Select>
                      {templateVariableKeys(sendTpl?.body).map((k) => (
                        <div key={k} className="flex flex-wrap items-center gap-2">
                          <span className="w-14 font-mono text-xs">{`{{${k}}}`}</span>
                          <InlineInput className="h-8 min-w-[160px] flex-1 text-sm" value={vars[k] ?? ''} onChange={(e) => setAction(i, { variables: { ...vars, [k]: e.target.value } })} />
                          <Select value="" onValueChange={(tok) => setAction(i, { variables: { ...vars, [k]: `${vars[k] ?? ''}${tok}` } })}>
                            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder={uiText('Inserir campo')} /></SelectTrigger>
                            <SelectContent>{tokenOptions.map((t) => <SelectItem key={t.token} value={t.token}>{uiText(t.label)}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <Select value="" onValueChange={(v) => setActions((p) => [...p, { type: v as ActionType, ...(v === 'set_consent' ? { channel: 'all', granted: false } : {}) }])}>
              <SelectTrigger className="h-9 w-[240px]"><SelectValue placeholder={uiText('+ Adicionar ação')} /></SelectTrigger>
              <SelectContent>{(Object.keys(ACTION_LABEL) as ActionType[]).map((t) => <SelectItem key={t} value={t}>{uiText(ACTION_LABEL[t])}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{uiText('Para marcar como perdida, crie uma tarefa para alguém confirmar.')}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>{uiText('Cancelar')}</Button>
          <Button disabled={saving} onClick={save}>{saving ? uiText('Salvando...') : uiText('Salvar')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ButtonRulesSettings() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const { data: cat } = useOrgCatalog(orgId ?? '');
  const { data: rules } = useQuery({
    queryKey: ['button-rules', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_button_rules' as never)
        .select('id, template_id, button_text, counts_as_reply, actions, is_active').eq('organization_id', orgId!).order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as Rule[];
    },
  });
  const { data: events } = useQuery({
    queryKey: ['button-events', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('whatsapp_button_events' as never)
        .select('id, button_text, status, results, sends_status, created_at').eq('organization_id', orgId!)
        .order('created_at', { ascending: false }).limit(15);
      return (data ?? []) as unknown as Array<{ id: string; button_text: string | null; status: string; results: Array<{ type: string; ok: boolean; error?: string }>; sends_status: string; created_at: string }>;
    },
  });
  const tplName = (id: string | null) => (id ? cat?.templates.find((t) => t.id === id)?.name ?? uiText('template') : uiText('Qualquer template'));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['button-rules', orgId] });

  const toggle = async (r: Rule, v: boolean) => {
    const { error } = await supabase.from('whatsapp_button_rules' as never).update({ is_active: v } as never).eq('id', r.id);
    if (error) toast.error(uiText('Não foi possível alterar.')); else refresh();
  };
  const remove = async (r: Rule) => {
    const { error } = await supabase.from('whatsapp_button_rules' as never).delete().eq('id', r.id);
    if (error) toast.error(uiText('Não foi possível excluir.')); else refresh();
  };

  if (!orgId) return null;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{uiText('Botões do WhatsApp')}</CardTitle>
            <CardDescription>{uiText('Quando o lead toca num botão da mensagem, o CRM faz as ações que você escolher.')}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing('new')}><Plus className="mr-1 h-4 w-4" />{uiText('Novo botão')}</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(rules ?? []).length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{uiText('Nenhum botão configurado.')}</p>}
          {(rules ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">"{r.button_text}" <span className="font-normal text-muted-foreground">· {tplName(r.template_id)}</span></p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.actions.length ? r.actions.map((a) => uiText(ACTION_LABEL[a.type] ?? a.type)).join(' → ') : uiText('Sem ação')}
                  {!r.counts_as_reply && ` · ${uiText('não conta como resposta')}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(r)}><PencilSimple className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(r)}><TrashSimple className="h-4 w-4 text-destructive" /></Button>
                <Switch checked={r.is_active} onCheckedChange={(v) => toggle(r, v)} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {(events ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{uiText('Últimos toques')}</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {(events ?? []).map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-28 text-muted-foreground">{new Date(e.created_at).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="min-w-0 flex-1 truncate">"{e.button_text}"</span>
                <Badge variant={e.status === 'failed' ? 'destructive' : 'outline'} className="text-[10px]">
                  {e.status === 'no_rule' ? uiText('sem regra') : e.status === 'applied' ? uiText('aplicado') : e.status === 'partial' ? uiText('em parte') : uiText('falhou')}
                </Badge>
                {e.results?.filter((x) => !x.ok).map((x, i) => <span key={i} className="text-destructive">{uiText(ACTION_LABEL[x.type as ActionType] ?? x.type)}: {x.error}</span>)}
                {e.sends_status === 'failed' && <span className="text-destructive">{uiText('template não enviado')}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {editing && (
        <RuleEditor orgId={orgId} rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }} />
      )}
    </div>
  );
}

export default ButtonRulesSettings;
