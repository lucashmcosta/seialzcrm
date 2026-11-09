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
  const [saving, setSaving] = useState(false);

  const agentQuery = useQuery({
    queryKey: ['agent-distribution', organizationId],
    queryFn: async (): Promise<AgentRow | null> => {
      const { data, error } = await supabase.from('ai_agents')
        .select('id, name, is_enabled, distribution_mode, distribution_value, handoff_ack_message' as never)
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
  }, [agent]);

  // Sem agente na org, a tela de rodízio fica como sempre foi.
  if (agentQuery.isLoading || agentQuery.isError || !agent) return null;

  const parsed = value.trim() === '' ? null : Number(value);
  const valid = isValidDistribution(mode, parsed);
  const dirty = mode !== agent.distribution_mode
    || (mode !== 'all' && parsed !== agent.distribution_value)
    || ack !== (agent.handoff_ack_message ?? DEFAULT_HANDOFF_ACK);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const { error } = await supabase.from('ai_agents')
      .update({ distribution_mode: mode, distribution_value: mode === 'all' ? null : parsed, handoff_ack_message: ack.trim() } as never)
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
