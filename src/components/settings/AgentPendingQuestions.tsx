import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Loader2, HelpCircle, Check, X, MessageSquare, Trash2 
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PendingQuestion {
  id: string;
  agent_id: string;
  organization_id: string;
  question: string;
  slot: string | null;
  source_feedback: string | null;
  status: string;
  answer: string | null;
  created_at: string;
  answered_at: string | null;
}

interface AgentPendingQuestionsProps {
  agentId: string;
  organizationId: string;
  onQuestionAnswered?: () => void;
}

export function AgentPendingQuestions({
  agentId,
  organizationId,
  onQuestionAnswered,
}: AgentPendingQuestionsProps) {
  const [questions, setQuestions] = useState<PendingQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (agentId) {
      fetchQuestions();
    }
  }, [agentId]);

  const fetchQuestions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('agent_pending_questions')
        .select('*')
        .eq('agent_id', agentId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (error: any) {
      console.error('Error fetching pending questions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswer = async (question: PendingQuestion) => {
    const answer = answers[question.id]?.trim();
    if (!answer) {
      toast.error('Digite uma resposta');
      return;
    }

    setSubmitting(question.id);
    try {
      // 1. Mark question as answered
      await supabase
        .from('agent_pending_questions')
        .update({
          status: 'answered',
          answer,
          answered_at: new Date().toISOString(),
        })
        .eq('id', question.id);

      // 2. Add as knowledge item
      await supabase.from('knowledge_items').insert({
        organization_id: organizationId,
        agent_id: agentId,
        type: 'faq',
        title: question.question.slice(0, 100),
        content: answer,
        source: 'pending_question',
        status: 'published',
      });

      toast.success('Resposta salva na Base de Conhecimento!');
      setQuestions(prev => prev.filter(q => q.id !== question.id));
      setAnswers(prev => {
        const updated = { ...prev };
        delete updated[question.id];
        return updated;
      });
      onQuestionAnswered?.();
    } catch (error: any) {
      console.error('Error answering question:', error);
      toast.error(error.message || 'Erro ao salvar resposta');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDismiss = async (questionId: string) => {
    setSubmitting(questionId);
    try {
      await supabase
        .from('agent_pending_questions')
        .update({ status: 'dismissed' })
        .eq('id', questionId);

      toast.info('Pergunta ignorada');
      setQuestions(prev => prev.filter(q => q.id !== questionId));
    } catch (error: any) {
      console.error('Error dismissing question:', error);
      toast.error('Erro ao ignorar pergunta');
    } finally {
      setSubmitting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (questions.length === 0) {
    return null;
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-amber-500" />
          Perguntas Pendentes
          <Badge variant="secondary" className="ml-2">
            {questions.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          O agente precisou de informações que não estavam na base. Responda para melhorar suas respostas futuras.
        </p>

        {questions.map((question) => (
          <div
            key={question.id}
            className="p-4 border rounded-lg bg-card space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="font-medium text-sm">{question.question}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(question.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => handleDismiss(question.id)}
                disabled={submitting === question.id}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {question.source_feedback && (
              <div className="p-2 bg-muted/50 rounded text-xs">
                <span className="font-medium">Contexto: </span>
                {question.source_feedback.slice(0, 200)}
                {question.source_feedback.length > 200 && '...'}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={`answer-${question.id}`} className="text-sm">
                Sua resposta:
              </Label>
              <Textarea
                id={`answer-${question.id}`}
                value={answers[question.id] || ''}
                onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                placeholder="Digite a resposta que o agente deve usar..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                onClick={() => handleAnswer(question)}
                disabled={submitting === question.id || !answers[question.id]?.trim()}
              >
                {submitting === question.id ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Salvar Resposta
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
