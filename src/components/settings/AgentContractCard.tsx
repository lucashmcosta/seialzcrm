// O agente de IA gera e envia o contrato pela SuvSign (ferramenta send_contract).
// Liga/desliga a ferramenta no agente e guarda a configuração em tool_settings.send_contract:
// modelos, responsável quando a oportunidade não tem dono e etapa depois do envio.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { callSignatureRequests } from '@/lib/signatureRequestsApi';
import { useOrgActiveUsers } from '@/hooks/settings/useOrgActiveUsers';

const TOOL = 'send_contract';
const NONE = '__none__';

interface AgentRow {
  id: string;
  enabled_tools: string[] | null;
  tool_settings: Record<string, unknown> | null;
}

interface ContractSettings {
  template_ids?: string[];
  responsible_user_id?: string | null;
  sent_stage_id?: string | null;
}

export function AgentContractCard({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [templateId, setTemplateId] = useState(NONE);
  const [responsible, setResponsible] = useState(NONE);
  const [stage, setStage] = useState(NONE);
  const [saving, setSaving] = useState(false);

  const agentQuery = useQuery({
    queryKey: ['agent-contract', organizationId],
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

  const templatesQuery = useQuery({
    queryKey: ['agent-contract-templates', organizationId],
    retry: false,
    queryFn: () => callSignatureRequests<{ templates: { id: string; name: string }[] }>('list_templates_admin', { organization_id: organizationId }),
  });

  const stagesQuery = useQuery({
    queryKey: ['agent-contract-stages', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('pipeline_stages').select('id, name, type, order_index')
        .eq('organization_id', organizationId).order('order_index', { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((s) => s.type !== 'won' && s.type !== 'lost');
    },
  });

  const { users } = useOrgActiveUsers(organizationId);

  const agent = agentQuery.data;
  const saved = (agent?.tool_settings?.[TOOL] ?? {}) as ContractSettings;

  useEffect(() => {
    if (!agent) return;
    setEnabled((agent.enabled_tools ?? []).includes(TOOL));
    setTemplateId(saved.template_ids?.[0] ?? NONE);
    setResponsible(saved.responsible_user_id ?? NONE);
    setStage(saved.sent_stage_id ?? NONE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id, agent?.enabled_tools, agent?.tool_settings]);

  if (!agent) return null;

  const templates = templatesQuery.data?.templates ?? [];
  const canEnable = templateId !== NONE;

  const save = async () => {
    if (enabled && !canEnable) {
      toast({ title: 'Escolha o modelo do contrato', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const tools = new Set(agent.enabled_tools ?? []);
    if (enabled) tools.add(TOOL); else tools.delete(TOOL);
    const settings: ContractSettings = {
      template_ids: templateId !== NONE ? [templateId] : [],
      responsible_user_id: responsible !== NONE ? responsible : null,
      sent_stage_id: stage !== NONE ? stage : null,
    };
    const { error } = await supabase.from('ai_agents')
      .update({ enabled_tools: [...tools], tool_settings: { ...(agent.tool_settings ?? {}), [TOOL]: settings } } as never)
      .eq('id', agent.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Contrato pelo agente salvo' });
    qc.invalidateQueries({ queryKey: ['agent-contract', organizationId] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Contrato pelo agente
        </CardTitle>
        <CardDescription>
          Quando a cliente quer contratar, o agente confere o CPF, gera o contrato pela SuvSign e manda o link para ela assinar.
          Quando ela assina, a oportunidade vai para Ganho e a conversa passa para a equipe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="agent-contract-enabled">Agente gera e envia o contrato</Label>
          <Switch id="agent-contract-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-1.5">
          <Label>Modelo do contrato (SuvSign)</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder="Escolha o modelo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nenhum</SelectItem>
              {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {templatesQuery.isError && (
            <p className="text-xs text-muted-foreground">Não foi possível listar os modelos. Confira se a SuvSign está conectada.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Responsável pelo envio</Label>
          <Select value={responsible} onValueChange={setResponsible}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Só o dono da oportunidade</SelectItem>
              {(users ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">O contrato sai em nome do dono da oportunidade. Esta pessoa entra quando a oportunidade não tem dono.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Etapa depois do envio</Label>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Não mudar a etapa</SelectItem>
              {(stagesQuery.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
