import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  const generateMutation = useMutation({
    mutationFn: async ({ action, prompt, context }: AIRequest): Promise<AIResponse> => {
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: { action, prompt, context },
      });

      if (error) throw error;
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
