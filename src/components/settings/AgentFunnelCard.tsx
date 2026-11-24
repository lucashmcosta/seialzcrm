// Funil pelo agente (ferramenta classify_lead). Liga/desliga a ferramenta no agente e guarda a
// configuração em tool_settings.classify_lead:
//  - resultados que o agente registra e o que cada um faz (ir para uma etapa ou perder com um
//    dos detalhes de perda da org);
//  - regras sem o modelo: etapa quando a lead responde, etapa quando o agente passa para a equipe
//    sem classificar e perda por silêncio depois do último follow-up;
//  - modo "Em teste" (só deixa uma nota dizendo o que faria) ou "Valendo".
// O servidor (_shared/intelligence/funnel-tool.ts) só avança e nunca mexe em ganho/perdido.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Funnel, Plus, Trash } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useLossOptions } from '@/components/opportunities/loss/useLossOptions';

const TOOL = 'classify_lead';
const NONE = '__none__';
const LOSE = '__lose__';

interface AgentRow {
  id: string;
  enabled_tools: string[] | null;
  tool_settings: Record<string, unknown> | null;
}

interface OutcomeDraft {
  key: string;
  label: string;
  description: string;
  /** id da etapa, LOSE para perda, NONE sem ação. */
  action: string;
  loss_detail_ids: string[];
}

interface SavedSettings {
  mode?: 'shadow' | 'apply';
  outcomes?: Array<{ key: string; label: string; description?: string; stage_id?: string | null; loss_detail_ids?: string[] }>;
  reply_stage_id?: string | null;
  handoff_stage_id?: string | null;
  silence_after_hours?: number;
  silence_rules?: Array<{ stage_id: string; detail_id: string }>;
}

/** "Equipe analisa" → "equipe_analisa" (o servidor aceita [a-z][a-z0-9_]{0,39}). */
function outcomeKey(label: string): string {
  const k = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return /^[a-z]/.test(k) ? k : `r_${k}`.slice(0, 40);
}

const emptyOutcome = (): OutcomeDraft => ({ key: '', label: '', description: '', action: NONE, loss_detail_ids: [] });

export function AgentFunnelCard({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<'shadow' | 'apply'>('shadow');
  const [outcomes, setOutcomes] = useState<OutcomeDraft[]>([]);
  const [replyStage, setReplyStage] = useState(NONE);
  const [handoffStage, setHandoffStage] = useState(NONE);
  const [silenceHours, setSilenceHours] = useState('72');
  const [silence, setSilence] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const agentQuery = useQuery({
    queryKey: ['agent-funnel', organizationId],
    queryFn: async (): Promise<AgentRow | null> => {
      const { data, error } = await supabase.from('ai_agents')
        .select('id, enabled_tools, tool_settings' as never)
        .eq('organization_id', organizationId).eq('agent_type', 'sdr')
        .order('is_enabled', { ascending: false }).order('created_at', { ascending: false })
        .limit(1).maybeSingle();
      if (error) throw error;
      return data as unknown as AgentRow | null;
    },
  });

  const stagesQuery = useQuery({
    queryKey: ['agent-funnel-stages', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('pipeline_stages').select('id, name, type, order_index')
        .eq('organization_id', organizationId).order('order_index', { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((s) => s.type !== 'won' && s.type !== 'lost');
    },
  });
  const stages = stagesQuery.data ?? [];

  const { options: loss } = useLossOptions(organizationId, true);
  const details = useMemo(
    () => loss.reasons.flatMap((r) => r.details.map((d) => ({ ...d, reasonName: r.name }))),
    [loss.reasons],
  );

  const agent = agentQuery.data;

  useEffect(() => {
    if (!agent) return;
    const saved = (agent.tool_settings?.[TOOL] ?? {}) as SavedSettings;
    setEnabled((agent.enabled_tools ?? []).includes(TOOL));
    setMode(saved.mode === 'apply' ? 'apply' : 'shadow');
    setOutcomes((saved.outcomes ?? []).map((o) => ({
      key: o.key, label: o.label, description: o.description ?? '',
      action: o.stage_id ? o.stage_id : (o.loss_detail_ids?.length ? LOSE : NONE),
      loss_detail_ids: o.loss_detail_ids ?? [],
    })));
    setReplyStage(saved.reply_stage_id ?? NONE);
    setHandoffStage(saved.handoff_stage_id ?? NONE);
    setSilenceHours(String(saved.silence_after_hours ?? 72));
    setSilence(Object.fromEntries((saved.silence_rules ?? []).map((r) => [r.stage_id, r.detail_id])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id, agent?.enabled_tools, agent?.tool_settings]);

  if (!agent) return null;

  const patchOutcome = (i: number, patch: Partial<OutcomeDraft>) =>
    setOutcomes((list) => list.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  const validate = (): string | null => {
    const keys = new Set<string>();
    for (const o of outcomes) {
      if (!o.label.trim()) return 'Dê um nome a cada resultado.';
      const key = o.key || outcomeKey(o.label);
      if (keys.has(key)) return `Há dois resultados com o mesmo nome: ${o.label}.`;
      keys.add(key);
      if (o.action === NONE) return `Escolha o que acontece em "${o.label}".`;
      if (o.action === LOSE && !o.loss_detail_ids.length) return `Escolha ao menos um motivo de perda em "${o.label}".`;
    }
    const hours = Number(silenceHours);
    if (Object.values(silence).some((d) => d !== NONE) && !(hours >= 24)) return 'O prazo da perda por silêncio é de pelo menos 24 horas.';
    if (enabled && !outcomes.length && replyStage === NONE && handoffStage === NONE && !Object.values(silence).some((d) => d !== NONE)) {
      return 'Configure ao menos um resultado ou uma regra.';
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      toast({ title: problem, variant: 'destructive' });
      return;
    }
    setSaving(true);
    const tools = new Set(agent.enabled_tools ?? []);
    if (enabled) tools.add(TOOL); else tools.delete(TOOL);
    const settings: SavedSettings = {
      mode,
      outcomes: outcomes.map((o) => ({
        key: o.key || outcomeKey(o.label),
        label: o.label.trim(),
        description: o.description.trim(),
        stage_id: o.action !== LOSE ? o.action : null,
        loss_detail_ids: o.action === LOSE ? o.loss_detail_ids : [],
      })),
      reply_stage_id: replyStage !== NONE ? replyStage : null,
      handoff_stage_id: handoffStage !== NONE ? handoffStage : null,
      silence_after_hours: Math.max(24, Math.round(Number(silenceHours) || 72)),
      silence_rules: Object.entries(silence).filter(([, d]) => d && d !== NONE).map(([stage_id, detail_id]) => ({ stage_id, detail_id })),
    };
    const { error } = await supabase.from('ai_agents')
      .update({ enabled_tools: [...tools], tool_settings: { ...(agent.tool_settings ?? {}), [TOOL]: settings } } as never)
      .eq('id', agent.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Funil pelo agente salvo' });
    qc.invalidateQueries({ queryKey: ['agent-funnel', organizationId] });
  };

  const stageSelect = (value: string, onChange: (v: string) => void, none: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{none}</SelectItem>
        {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Funnel className="h-4 w-4" />
          Funil pelo agente
        </CardTitle>
        <CardDescription>
          O agente registra a conclusão de cada caso e a oportunidade vai para a etapa certa, ou é perdida com o motivo.
          Ele só avança: nunca volta uma etapa nem mexe em oportunidade ganha ou perdida.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="agent-funnel-enabled">Agente move o funil</Label>
          <Switch id="agent-funnel-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-1.5">
          <Label>Modo</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as 'shadow' | 'apply')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="shadow">Em teste: só deixa uma nota na conversa dizendo o que faria</SelectItem>
              <SelectItem value="apply">Valendo: move e marca perda</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Resultados que o agente registra</Label>
            <p className="text-xs text-muted-foreground">O agente escolhe um destes quando chega a uma conclusão. Use os mesmos nomes do prompt dele.</p>
          </div>
          {outcomes.map((o, i) => (
            <div key={i} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Input placeholder="Nome (ex.: Qualificada)" value={o.label}
                  onChange={(e) => patchOutcome(i, { label: e.target.value })} />
                <Button variant="ghost" size="icon" aria-label="Tirar resultado"
                  onClick={() => setOutcomes((list) => list.filter((_, j) => j !== i))}>
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
              <Textarea rows={2} placeholder="Quando usar (o agente lê isto)" value={o.description}
                onChange={(e) => patchOutcome(i, { description: e.target.value })} />
              <Select value={o.action} onValueChange={(v) => patchOutcome(i, { action: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Escolha o que acontece</SelectItem>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>Ir para {s.name}</SelectItem>)}
                  <SelectItem value={LOSE}>Marcar como perdida</SelectItem>
                </SelectContent>
              </Select>
              {o.action === LOSE && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Motivos que o agente pode escolher:</p>
                  {details.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={o.loss_detail_ids.includes(d.id)}
                        onCheckedChange={(c) => patchOutcome(i, {
                          loss_detail_ids: c ? [...o.loss_detail_ids, d.id] : o.loss_detail_ids.filter((x) => x !== d.id),
                        })} />
                      <span>{d.reasonName}: {d.name}</span>
                    </label>
                  ))}
                  {!details.length && <p className="text-xs text-muted-foreground">A org não tem motivos de perda com detalhe.</p>}
                </div>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setOutcomes((list) => [...list, emptyOutcome()])}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar resultado
          </Button>
        </div>

        <div className="space-y-3">
          <Label>Regras automáticas (sem depender do agente)</Label>
          <div className="space-y-1.5">
            <p className="text-sm">Quando a lead responde ao agente</p>
            {stageSelect(replyStage, setReplyStage, 'Não mudar a etapa')}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm">Quando o agente passa para a equipe sem registrar a conclusão</p>
            {stageSelect(handoffStage, setHandoffStage, 'Não mudar a etapa')}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm">Perda por silêncio: depois do último follow-up, sem resposta por</p>
            <div className="flex items-center gap-2">
              <Input className="w-24" type="number" min={24} value={silenceHours} onChange={(e) => setSilenceHours(e.target.value)} />
              <span className="text-sm text-muted-foreground">horas, nas etapas abaixo</span>
            </div>
            {stages.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate text-sm">{s.name}</span>
                <Select value={silence[s.id] ?? NONE} onValueChange={(v) => setSilence((m) => ({ ...m, [s.id]: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não perder</SelectItem>
                    {details.map((d) => <SelectItem key={d.id} value={d.id}>{d.reasonName}: {d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Deixe "Não perder" nas etapas em que a equipe conduz.</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
