// Quantos leads novos do WhatsApp vão para o agente SDR. O resto segue para o rodízio.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Robot } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_HANDOFF_ACK, DISTRIBUTION_LIMITS, describeDistribution, isValidDistribution, type DistributionMode } from '@/lib/agentDistribution';

interface AgentRow {
  id: string;
  name: string;
  is_enabled: boolean;
  distribution_mode: DistributionMode;
  distribution_value: number | null;
  handoff_ack_message: string | null;
  presents_as_assistant: boolean;
  followup_enabled: boolean;
  followup_delays_minutes: number[] | null;
}

interface Stats {
  agent_leads: number;
  agent_handed_off: number;
  agent_won: number;
  human_leads: number;
  human_won: number;
}

const VALUE_LABEL: Record<Exclude<DistributionMode, 'all'>, string> = {
  every_n: 'A cada quantos leads',
  percent: 'Porcentagem',
  daily_quota: 'Leads por dia',
};

export function AgentDistributionCard({ organizationId, roundRobinEnabled }: { organizationId: string; roundRobinEnabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<DistributionMode>('all');
  const [value, setValue] = useState('');
  const [ack, setAck] = useState('');
  const [asAssistant, setAsAssistant] = useState(true);
  const [followup, setFollowup] = useState(false);
  const [delay1, setDelay1] = useState('2');
  const [delay2, setDelay2] = useState('20');
  const [saving, setSaving] = useState(false);

  const agentQuery = useQuery({
    queryKey: ['agent-distribution', organizationId],
    queryFn: async (): Promise<AgentRow | null> => {
      const { data, error } = await supabase.from('ai_agents')
        .select('id, name, is_enabled, distribution_mode, distribution_value, handoff_ack_message, presents_as_assistant, followup_enabled, followup_delays_minutes' as never)
        .eq('organization_id', organizationId).eq('agent_type', 'sdr')
        .order('is_enabled', { ascending: false }).order('created_at', { ascending: false })
        .limit(1).maybeSingle();
      if (error) throw error;
      return data as unknown as AgentRow | null;
    },
  });
  const statsQuery = useQuery({
    queryKey: ['agent-distribution-stats', organizationId],
    enabled: !!agentQuery.data,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_agent_distribution_stats' as never, { _org: organizationId, _days: 30 } as never);
      if (error) throw error;
      return data as unknown as Stats;
    },
  });

  const agent = agentQuery.data;
  useEffect(() => {
    if (!agent) return;
    setMode(agent.distribution_mode);
    setValue(agent.distribution_value === null ? '' : String(agent.distribution_value));
    setAck(agent.handoff_ack_message ?? DEFAULT_HANDOFF_ACK);
    setAsAssistant(agent.presents_as_assistant !== false);
    setFollowup(agent.followup_enabled === true);
    const d = agent.followup_delays_minutes ?? [120, 1200];
    setDelay1(String((d[0] ?? 120) / 60));
    setDelay2(String((d[1] ?? 1200) / 60));
  }, [agent]);

  // Sem agente na org, a tela de rodízio fica como sempre foi.
  if (agentQuery.isLoading || agentQuery.isError || !agent) return null;

  const parsed = value.trim() === '' ? null : Number(value);
  // Retomadas em horas, convertidas em minutos; a segunda é opcional. Tudo dentro de 23 h.
  const hours = [delay1, delay2].map((v) => Number(v.replace(',', '.')));
  const delaysMinutes = hours.filter((h, i) => i === 0 || (delay2.trim() !== '' && h > 0)).map((h) => Math.round(h * 60));
  const delaysValid = !followup || (delaysMinutes.length > 0 && delaysMinutes.every((m, i) => m >= 30 && m <= 1380 && (i === 0 || m > delaysMinutes[i - 1])));
  const valid = isValidDistribution(mode, parsed) && delaysValid;
  const dirty = mode !== agent.distribution_mode
    || (mode !== 'all' && parsed !== agent.distribution_value)
    || ack !== (agent.handoff_ack_message ?? DEFAULT_HANDOFF_ACK)
    || asAssistant !== (agent.presents_as_assistant !== false)
    || followup !== (agent.followup_enabled === true)
    || delaysMinutes.join(',') !== (agent.followup_delays_minutes ?? [120, 1200]).join(',');

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const { error } = await supabase.from('ai_agents')
      .update({ distribution_mode: mode, distribution_value: mode === 'all' ? null : parsed, handoff_ack_message: ack.trim(), presents_as_assistant: asAssistant, followup_enabled: followup, followup_delays_minutes: delaysMinutes } as never)
      .eq('id', agent.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Distribuição atualizada' });
    void qc.invalidateQueries({ queryKey: ['agent-distribution', organizationId] });
  };

  const stats = statsQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Robot size={20} weight="light" className="text-primary" />
          Agente na distribuição
        </CardTitle>
        <CardDescription>
          Só leads novos do WhatsApp. Quem já tem dono continua com o dono, e o vendedor é escolhido na passagem do agente para o humano.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          {agent.name}: <span className={agent.is_enabled ? 'font-medium' : 'text-muted-foreground'}>{agent.is_enabled ? 'ligado' : 'desligado, não recebe leads'}</span>
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="agent-dist-mode">Como distribuir</Label>
            <Select value={mode} onValueChange={(v) => { setMode(v as DistributionMode); setValue(''); }}>
              <SelectTrigger id="agent-dist-mode" className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os leads novos</SelectItem>
                <SelectItem value="every_n">1 a cada N leads</SelectItem>
                <SelectItem value="percent">Porcentagem</SelectItem>
                <SelectItem value="daily_quota">Quantidade por dia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode !== 'all' && (
            <div className="space-y-1.5">
              <Label htmlFor="agent-dist-value">{VALUE_LABEL[mode]}</Label>
              <Input
                id="agent-dist-value" type="number" className="w-32" value={value}
                min={DISTRIBUTION_LIMITS[mode].min} max={DISTRIBUTION_LIMITS[mode].max}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{describeDistribution(mode, parsed)}</p>
        <div className="space-y-1.5">
          <Label htmlFor="agent-handoff-ack">Aviso quando o agente não consegue seguir</Label>
          <Textarea id="agent-handoff-ack" rows={2} value={ack} onChange={(e) => setAck(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Enviado ao passar para uma pessoa quando chega documento ou um áudio que ele não entendeu. Deixe em branco para não enviar nada. A conversa passa para a equipe do mesmo jeito.
          </p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="agent-presents-as-assistant">Apresentar-se como assistente virtual</Label>
            <p className="text-xs text-muted-foreground">
              Desligado, {agent.name} se apresenta só pelo nome, como alguém da equipe. Se perguntarem diretamente se é uma pessoa ou uma IA, responde sempre a verdade.
            </p>
          </div>
          <Switch id="agent-presents-as-assistant" checked={asAssistant} onCheckedChange={setAsAssistant} />
        </div>
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="agent-followup">Retomar quem parou de responder</Label>
              <p className="text-xs text-muted-foreground">
                Enquanto a conversa está com {agent.name}, ele manda uma retomada curta se o cliente parar de responder. Só dentro de 24 h da última mensagem do cliente, entre 8h e 20h. Para quando o cliente responde ou a conversa passa para a equipe.
              </p>
            </div>
            <Switch id="agent-followup" checked={followup} onCheckedChange={setFollowup} />
          </div>
          {followup && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="agent-followup-1">1ª retomada (horas)</Label>
                <Input id="agent-followup-1" type="number" step="0.5" min={0.5} max={23} className="w-28" value={delay1} onChange={(e) => setDelay1(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-followup-2">2ª retomada (horas, opcional)</Label>
                <Input id="agent-followup-2" type="number" step="0.5" min={0.5} max={23} className="w-28" value={delay2} onChange={(e) => setDelay2(e.target.value)} />
              </div>
            </div>
          )}
          {followup && !delaysValid && (
            <p className="text-xs text-destructive">Use entre 0,5 e 23 horas, com a 2ª depois da 1ª.</p>
          )}
        </div>
        <Button onClick={save} disabled={!valid || !dirty || saving}>Salvar</Button>
        {!roundRobinEnabled && (
          <p className="text-sm text-amber-700">
            O rodízio está desligado: a conversa passada pelo agente fica marcada para atenção, sem vendedor definido.
          </p>
        )}
        {stats && (
          <div className="rounded-md border p-3 text-sm">
            <p className="mb-2 font-medium">Últimos 30 dias</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Com o agente</span>
              <span>{stats.agent_leads} leads, {stats.agent_handed_off} passados, {stats.agent_won} ganhos</span>
              <span className="text-muted-foreground">Sem o agente</span>
              <span>{stats.human_leads} leads, {stats.human_won} ganhos</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
