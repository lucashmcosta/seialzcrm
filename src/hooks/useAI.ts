import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

type AIAction = 'summarize_contact' | 'suggest_reply' | 'analyze_opportunity' | 'generate_email' | 'improve_text' | 'custom';

interface AIRequest {
  action: AIAction;
  prompt?: string;
  context?: Record<string, any>;
}

interface AIResponse {
  success: boolean;
  content: string;
  model: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export function useAI() {
  const { organization } = useOrganization();
  const generateMutation = useMutation({
    mutationFn: async ({ action, prompt, context }: AIRequest): Promise<AIResponse> => {
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: { action, prompt, context, organization_id: organization?.id },
      });

      if (error) {
        // A função explica o motivo no corpo da resposta (chave recusada, limite atingido...).
        const detail = await (error as { context?: Response }).context?.clone?.().json?.().catch(() => null);
        throw new Error(detail?.error || error.message);
      }
      if (!data.success) throw new Error(data.error || 'AI generation failed');
      
      return data;
    },
  });

  return {
    generate: generateMutation.mutateAsync,
    isLoading: generateMutation.isPending,
    error: generateMutation.error,
    reset: generateMutation.reset,
  };
}
