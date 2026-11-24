// Agentes de IA que, ao encerrar a conversa, também marcam a oportunidade como perdida com o motivo.
// Grava ai_agents.tool_settings.end_conversation.mark_lost; ligar também liga a ferramenta "Encerrar conversa".
import { useCallback, useEffect, useState } from 'react';
import { Robot } from '@phosphor-icons/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { uiText, useUiLocale } from '@/lib/ui-locale';

interface AgentRow {
  id: string;
  name: string;
  is_enabled: boolean;
  enabled_tools: string[] | null;
  tool_settings: Record<string, unknown> | null;
}

const TOOL = 'end_conversation';

const markLost = (a: AgentRow) => ((a.tool_settings?.[TOOL] ?? {}) as { mark_lost?: boolean }).mark_lost === true;

export function LossAgentsCard({ organizationId, canManage, hasActiveReason }: { organizationId: string; canManage: boolean; hasActiveReason: boolean }) {
  useUiLocale();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('ai_agents')
      .select('id, name, is_enabled, enabled_tools, tool_settings' as never)
      .eq('organization_id', organizationId).order('is_enabled', { ascending: false }).order('name');
    setAgents((data ?? []) as unknown as AgentRow[]);
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);

  if (agents.length === 0) return null;

  const toggle = async (agent: AgentRow, on: boolean) => {
    setSaving(agent.id);
    const tools = new Set(agent.enabled_tools ?? []);
    if (on) tools.add(TOOL);
    const current = (agent.tool_settings?.[TOOL] ?? {}) as Record<string, unknown>;
    const { error } = await supabase.from('ai_agents')
      .update({ enabled_tools: [...tools], tool_settings: { ...(agent.tool_settings ?? {}), [TOOL]: { ...current, mark_lost: on } } } as never)
      .eq('id', agent.id);
    setSaving(null);
    if (error) {
      toast({ title: uiText('Não foi possível salvar'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: on ? uiText('O agente vai marcar como perdida ao encerrar') : uiText('O agente só encerra a conversa') });
    await load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{uiText('Agentes de IA')}</CardTitle>
        <CardDescription>
          {uiText('Quando o agente encerra a conversa (o caso não se encaixa ou o cliente desistiu), ele também marca a oportunidade aberta como Perdida, com o motivo do cadastro.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasActiveReason && <p className="text-xs text-muted-foreground">{uiText('Cadastre pelo menos um motivo ativo para ligar.')}</p>}
        {agents.map((a) => {
          const hasTool = (a.enabled_tools ?? []).includes(TOOL);
          return (
            <div key={a.id} className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="flex items-start gap-2">
                <Robot className="mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <Label>{a.name}{!a.is_enabled && <span className="ml-2 text-xs font-normal text-muted-foreground">{uiText('(desligado)')}</span>}</Label>
                  <p className="text-xs text-muted-foreground">
                    {hasTool
                      ? uiText('Encerra conversas. Ligue para também marcar como perdida.')
                      : uiText('Ainda não encerra conversas: ligar aqui liga também a ferramenta "Encerrar conversa".')}
                  </p>
                </div>
              </div>
              <Switch checked={hasTool && markLost(a)} disabled={!canManage || saving === a.id || (!hasActiveReason && !markLost(a))}
                onCheckedChange={(v) => void toggle(a, v)} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
