import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SDRAgentCard } from './SDRAgentCard';
import { SDRAgentWizard } from './SDRAgentWizard';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Json } from '@/integrations/supabase/types';

interface WizardData {
  companyName: string;
  companySegment: string;
  companyDescription: string;
  products: string;
  differentials: string;
  goal: string;
  tone: string;
  salesPitch: string;
  restrictions: string;
  generatedPrompt: string;
}

interface FeedbackEntry {
  id: string;
  date: string;
  feedback: string;
  applied: boolean;
}

interface AIAgent {
  id: string;
  name: string;
  is_enabled: boolean;
  custom_instructions: string | null;
  wizard_data: any;
  feedback_history?: FeedbackEntry[];
  enabled_tools?: string[];
  ai_provider?: string | null;
  ai_model?: string | null;
  max_messages_per_conversation?: number | null;
}

export function AIAgentSettings() {
  const { organization } = useOrganization();
  const [isLoading, setIsLoading] = useState(true);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null);

  useEffect(() => {
    if (organization?.id) {
      fetchAgents();
    }
  }, [organization?.id]);

  const fetchAgents = async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const parsedAgents: AIAgent[] = (data || []).map(agent => {
        let feedbackHistory: FeedbackEntry[] = [];
        if (Array.isArray(agent.feedback_history)) {
          feedbackHistory = agent.feedback_history as unknown as FeedbackEntry[];
        }
        
        return {
          id: agent.id,
          name: agent.name,
          is_enabled: agent.is_enabled,
          custom_instructions: agent.custom_instructions,
          wizard_data: agent.wizard_data,
          feedback_history: feedbackHistory,
          enabled_tools: (agent.enabled_tools as string[]) || ['update_contact', 'transfer_to_human'],
          ai_provider: agent.ai_provider,
          ai_model: agent.ai_model,
          max_messages_per_conversation: agent.max_messages_per_conversation,
        };
      });
      
      setAgents(parsedAgents);
    } catch (error: any) {
      console.error('Error fetching agents:', error);
      toast.error('Erro ao carregar agentes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (agentId: string, enabled: boolean) => {
    try {
      // If enabling this agent, disable others first
      if (enabled) {
        const { error: disableError } = await supabase
          .from('ai_agents')
          .update({ is_enabled: false })
          .eq('organization_id', organization?.id)
          .neq('id', agentId);
        
        if (disableError) throw disableError;
      }

      const { error } = await supabase
        .from('ai_agents')
        .update({ is_enabled: enabled })
        .eq('id', agentId);

      if (error) throw error;

      setAgents(prev => prev.map(a => ({
        ...a,
        is_enabled: a.id === agentId ? enabled : (enabled ? false : a.is_enabled)
      })));
      toast.success(enabled ? 'Agente ativado' : 'Agente desativado');
    } catch (error: any) {
      console.error('Error toggling agent:', error);
      toast.error('Erro ao alterar status do agente');
    }
  };

  const handleConfigure = (agent: AIAgent | null) => {
    setSelectedAgent(agent);
    setWizardOpen(true);
  };

  const handleDuplicate = async (agent: AIAgent) => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('ai_agents')
        .insert({
          organization_id: organization.id,
          name: `${agent.name} (Cópia)`,
          custom_instructions: agent.custom_instructions,
          wizard_data: agent.wizard_data,
          feedback_history: agent.feedback_history as unknown as Json,
          enabled_tools: agent.enabled_tools as Json,
          is_enabled: false,
          ai_provider: agent.ai_provider,
          ai_model: agent.ai_model,
          max_messages_per_conversation: agent.max_messages_per_conversation,
          goal: 'Qualificar leads',
          tone: 'friendly',
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Agente duplicado! Edite e ative quando estiver pronto.');
      fetchAgents();
    } catch (error: any) {
      console.error('Error duplicating agent:', error);
      toast.error('Erro ao duplicar agente');
    }
  };

  const handleWizardClose = (open: boolean) => {
    setWizardOpen(open);
    if (!open) {
      setSelectedAgent(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Render existing agents */}
      {agents.map(agent => (
        <SDRAgentCard
          key={agent.id}
          agent={agent}
          isLoading={isLoading}
          onConfigure={() => handleConfigure(agent)}
          onToggle={(enabled) => handleToggle(agent.id, enabled)}
          onDuplicate={() => handleDuplicate(agent)}
        />
      ))}

      {/* Empty state / Add new agent button */}
      {agents.length === 0 ? (
        <SDRAgentCard
          agent={null}
          isLoading={isLoading}
          onConfigure={() => handleConfigure(null)}
          onToggle={() => {}}
        />
      ) : (
        <Button
          variant="outline"
          className="w-full border-dashed"
          onClick={() => handleConfigure(null)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Criar novo agente
        </Button>
      )}

      <SDRAgentWizard
        open={wizardOpen}
        onOpenChange={handleWizardClose}
        existingAgent={selectedAgent}
        organizationId={organization?.id || ''}
        onSuccess={fetchAgents}
      />
    </div>
  );
}

export default AIAgentSettings;