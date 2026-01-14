import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SDRAgentCard } from './SDRAgentCard';
import { SDRAgentWizard } from './SDRAgentWizard';
import { Loader2 } from 'lucide-react';
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
}

export function AIAgentSettings() {
  const { organization } = useOrganization();
  const [isLoading, setIsLoading] = useState(true);
  const [agent, setAgent] = useState<AIAgent | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    if (organization?.id) {
      fetchAgent();
    }
  }, [organization?.id]);

  const fetchAgent = async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('organization_id', organization.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        // Parse feedback_history from JSON
        let feedbackHistory: FeedbackEntry[] = [];
        if (Array.isArray(data.feedback_history)) {
          feedbackHistory = data.feedback_history as unknown as FeedbackEntry[];
        }
        
        setAgent({
          id: data.id,
          name: data.name,
          is_enabled: data.is_enabled,
          custom_instructions: data.custom_instructions,
          wizard_data: data.wizard_data,
          feedback_history: feedbackHistory,
          enabled_tools: (data.enabled_tools as string[]) || ['update_contact', 'transfer_to_human'],
        });
      }
    } catch (error: any) {
      console.error('Error fetching agent:', error);
      toast.error('Erro ao carregar configurações do agente');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (!agent?.id) return;

    try {
      const { error } = await supabase
        .from('ai_agents')
        .update({ is_enabled: enabled })
        .eq('id', agent.id);

      if (error) throw error;

      setAgent(prev => prev ? { ...prev, is_enabled: enabled } : null);
      toast.success(enabled ? 'Agente ativado' : 'Agente desativado');
    } catch (error: any) {
      console.error('Error toggling agent:', error);
      toast.error('Erro ao alterar status do agente');
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
      <SDRAgentCard
        agent={agent}
        isLoading={isLoading}
        onConfigure={() => setWizardOpen(true)}
        onToggle={handleToggle}
      />

      <SDRAgentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        existingAgent={agent}
        organizationId={organization?.id || ''}
        onSuccess={fetchAgent}
      />
    </div>
  );
}

export default AIAgentSettings;
