import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Sparkles, Bot, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AgentMessageFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: {
    id: string;
    content: string;
    sender_agent_id: string | null;
    sender_name: string | null;
  };
  organizationId: string;
  onFeedbackApplied?: () => void;
}

export function AgentMessageFeedbackDialog({
  open,
  onOpenChange,
  message,
  organizationId,
  onFeedbackApplied,
}: AgentMessageFeedbackDialogProps) {
  const [idealResponse, setIdealResponse] = useState('');
  const [applyImmediately, setApplyImmediately] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!idealResponse.trim()) {
      toast.error('Digite como o agente deveria ter respondido');
      return;
    }

    if (!message.sender_agent_id) {
      toast.error('ID do agente não encontrado');
      return;
    }

    setIsSubmitting(true);
    try {
      // Format feedback contextually
      const formattedFeedback = `Quando o agente respondeu "${message.content.slice(0, 100)}${message.content.length > 100 ? '...' : ''}", a resposta ideal seria: "${idealResponse}"`;

      if (applyImmediately) {
        // Get current agent data
        const { data: agent, error: agentError } = await supabase
          .from('ai_agents')
          .select('custom_instructions, feedback_history')
          .eq('id', message.sender_agent_id)
          .single();

        if (agentError) throw agentError;

        // Call AI to refine prompt
        const { data: refineData, error: refineError } = await supabase.functions.invoke('ai-generate', {
          body: {
            action: 'refine_agent_prompt',
            context: {
              currentPrompt: agent.custom_instructions,
              feedback: formattedFeedback,
            },
          },
        });

        if (refineError) throw refineError;

        // Update agent with new prompt and add to feedback history
        const currentHistory = (agent.feedback_history as any[]) || [];
        const newEntry = {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          feedback: formattedFeedback,
          originalMessage: message.content,
          idealResponse: idealResponse,
          applied: true,
        };

        const { error: updateError } = await supabase
          .from('ai_agents')
          .update({
            custom_instructions: refineData.content,
            feedback_history: JSON.parse(JSON.stringify([newEntry, ...currentHistory])),
          })
          .eq('id', message.sender_agent_id);

        if (updateError) throw updateError;

        toast.success('Feedback aplicado! O agente aprenderá com isso.');
      } else {
        // Just save to feedback history without applying
        const { data: agent, error: agentError } = await supabase
          .from('ai_agents')
          .select('feedback_history')
          .eq('id', message.sender_agent_id)
          .single();

        if (agentError) throw agentError;

        const currentHistory = (agent.feedback_history as any[]) || [];
        const newEntry = {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          feedback: formattedFeedback,
          originalMessage: message.content,
          idealResponse: idealResponse,
          applied: false,
        };

        const { error: updateError } = await supabase
          .from('ai_agents')
          .update({
            feedback_history: JSON.parse(JSON.stringify([newEntry, ...currentHistory])),
          })
          .eq('id', message.sender_agent_id);

        if (updateError) throw updateError;

        toast.success('Feedback salvo para revisão posterior.');
      }

      setIdealResponse('');
      onOpenChange(false);
      onFeedbackApplied?.();
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      toast.error(error.message || 'Erro ao enviar feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Feedback para o Agente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original message */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-purple-500" />
              Mensagem original do agente:
            </Label>
            <div className="p-3 bg-muted rounded-lg text-sm">
              {message.content}
            </div>
          </div>

          {/* Ideal response */}
          <div className="space-y-2">
            <Label htmlFor="ideal-response">
              Como ele deveria ter respondido?
            </Label>
            <Textarea
              id="ideal-response"
              value={idealResponse}
              onChange={(e) => setIdealResponse(e.target.value)}
              placeholder="Ex: Olá! Obrigado pelo interesse. Posso agendar uma demonstração gratuita para mostrar como nossa solução pode ajudar sua empresa..."
              rows={4}
            />
          </div>

          {/* Apply immediately checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="apply-immediately"
              checked={applyImmediately}
              onCheckedChange={(checked) => setApplyImmediately(checked === true)}
            />
            <label
              htmlFor="apply-immediately"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Aplicar imediatamente ao prompt do agente
            </label>
          </div>

          <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm text-muted-foreground">
              {applyImmediately
                ? 'O prompt do agente será atualizado automaticamente com este feedback.'
                : 'O feedback será salvo para revisão posterior nas configurações do agente.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !idealResponse.trim()}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Salvar Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
