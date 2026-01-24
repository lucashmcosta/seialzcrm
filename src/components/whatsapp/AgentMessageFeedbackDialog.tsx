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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { 
  Loader2, Sparkles, Bot, MessageSquare, Database, 
  SlidersHorizontal, HelpCircle, Wrench, ArrowLeft, ArrowRight,
  Check, AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AgentMessageFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: {
    id: string;
    content: string;
    sender_agent_id: string | null;
    sender_name: string | null;
  };
  customerMessage?: string;
  organizationId: string;
  onFeedbackApplied?: () => void;
}

type ClassificationType = 'KB_FACT' | 'AGENT_RULE' | 'MISSING_INFO' | 'FLOW_TOOL';

interface ClassificationResult {
  classification: ClassificationType;
  reason: string;
  confidence: number;
  patch: {
    kb_update?: {
      title: string;
      content: string;
      type?: 'faq' | 'policy' | 'product' | 'general';
      tags: string[];
    };
    agent_rule_update?: {
      rule: string;
      example_good_response: string;
    };
    wizard_question?: {
      question: string;
      slot: string;
    };
    flow_tool_update?: {
      rule: string;
      trigger: string;
    };
  };
}

const CLASSIFICATION_INFO: Record<ClassificationType, {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = {
  KB_FACT: {
    label: 'Fato/Conteúdo',
    description: 'O agente informou algo incorreto. Será atualizado na Base de Conhecimento.',
    icon: Database,
    color: 'text-blue-500',
  },
  AGENT_RULE: {
    label: 'Comportamento/Estilo',
    description: 'O agente respondeu de forma inadequada. Será adicionada regra de comportamento.',
    icon: SlidersHorizontal,
    color: 'text-purple-500',
  },
  MISSING_INFO: {
    label: 'Informação Faltando',
    description: 'O agente não tinha informação suficiente. Será criada pergunta para completar.',
    icon: HelpCircle,
    color: 'text-amber-500',
  },
  FLOW_TOOL: {
    label: 'Fluxo/Ferramenta',
    description: 'Erro no uso de ferramentas ou fluxo. Serão ajustados os gatilhos.',
    icon: Wrench,
    color: 'text-green-500',
  },
};

const MAX_AGENT_RULES = 20;

export function AgentMessageFeedbackDialog({
  open,
  onOpenChange,
  message,
  customerMessage,
  organizationId,
  onFeedbackApplied,
}: AgentMessageFeedbackDialogProps) {
  const [step, setStep] = useState<'input' | 'classification' | 'applying'>('input');
  const [idealResponse, setIdealResponse] = useState('');
  const [isClassifying, setIsClassifying] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null);
  const [selectedClassification, setSelectedClassification] = useState<ClassificationType | null>(null);

  const handleClassify = async () => {
    if (!idealResponse.trim()) {
      toast.error('Digite como o agente deveria ter respondido');
      return;
    }

    if (!message.sender_agent_id) {
      toast.error('ID do agente não encontrado');
      return;
    }

    setIsClassifying(true);
    try {
      // Get current agent data for context
      const { data: agent } = await supabase
        .from('ai_agents')
        .select('custom_instructions, feedback_rules')
        .eq('id', message.sender_agent_id)
        .single();

      // Call the classification edge function
      const { data, error } = await supabase.functions.invoke('classify-agent-feedback', {
        body: {
          customerMessage: customerMessage || '',
          agentAnswer: message.content,
          userFeedback: idealResponse,
          agentRulesSummary: agent?.custom_instructions?.slice(0, 500) || '',
          agentId: message.sender_agent_id,
          organizationId,
        },
      });

      if (error) throw error;

      setClassificationResult(data);
      setSelectedClassification(data.classification);
      setStep('classification');
    } catch (error: any) {
      console.error('Error classifying feedback:', error);
      toast.error(error.message || 'Erro ao classificar feedback');
    } finally {
      setIsClassifying(false);
    }
  };

  const handleApply = async () => {
    if (!classificationResult || !selectedClassification || !message.sender_agent_id) return;

    setIsApplying(true);
    setStep('applying');

    try {
      const agentId = message.sender_agent_id;

      switch (selectedClassification) {
        case 'KB_FACT': {
          // Create knowledge item and process it for RAG
          const patch = classificationResult.patch.kb_update;
          if (patch?.content) {
            // Infer type from tags if not provided
            const inferTypeFromTags = (tags: string[]): 'policy' | 'faq' | 'product' | 'general' => {
              const policyKeywords = ['política', 'policy', 'pagamento', 'cancelamento', 'prazo', 'regra', 'pix', 'cartão'];
              const productKeywords = ['produto', 'serviço', 'preço', 'plano', 'product'];
              const lowerTags = tags?.map(t => t.toLowerCase()) || [];
              
              if (lowerTags.some(t => policyKeywords.some(k => t.includes(k)))) return 'policy';
              if (lowerTags.some(t => productKeywords.some(k => t.includes(k)))) return 'product';
              return 'faq';
            };
            
            const kbType = patch.type || inferTypeFromTags(patch.tags || []);
            
            // Step 1: Insert the knowledge item (without content - it goes to chunks)
            const { data: newItem, error: insertError } = await supabase
              .from('knowledge_items')
              .insert({
                organization_id: organizationId,
                agent_id: agentId,
                type: kbType,
                title: patch.title || 'Correção via Feedback',
                source: 'manual',
                status: 'draft', // Will be set to published by process-knowledge
                metadata: { 
                  tags: patch.tags || [],
                  origin: 'chat_feedback',
                  original_message_id: message.id,
                  original_message: message.content.slice(0, 200),
                },
              })
              .select('id')
              .single();

            if (insertError) {
              console.error('Error creating knowledge item:', insertError);
              toast.error('Erro ao criar item na base de conhecimento');
              break;
            }

            // Step 2: Process the knowledge to generate embeddings/chunks
            const { error: processError } = await supabase.functions.invoke('process-knowledge', {
              body: {
                itemId: newItem.id,
                content: patch.content,
              },
            });

            if (processError) {
              console.error('Error processing knowledge:', processError);
              toast.error('Erro ao processar conhecimento para RAG');
              // Delete the orphan item
              await supabase.from('knowledge_items').delete().eq('id', newItem.id);
              break;
            }

            toast.success('Base de Conhecimento atualizada!');
          } else {
            toast.warning('Nenhum conteúdo para adicionar');
          }
          break;
        }

        case 'AGENT_RULE': {
          // Add rule to feedback_rules (max 20)
          const { data: agent } = await supabase
            .from('ai_agents')
            .select('feedback_rules')
            .eq('id', agentId)
            .single();

          const currentRules = (agent?.feedback_rules as any[]) || [];
          
          if (currentRules.filter((r: any) => r.isActive !== false).length >= MAX_AGENT_RULES) {
            toast.warning(`Limite de ${MAX_AGENT_RULES} regras atingido. Desative algumas para adicionar novas.`);
            break;
          }

          const patch = classificationResult.patch.agent_rule_update;
          const newRule = {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            trigger: patch?.rule || `Quando responder similar a "${message.content.slice(0, 50)}..."`,
            response: patch?.example_good_response || idealResponse,
            priority: currentRules.length + 1,
            isActive: true,
          };

          await supabase
            .from('ai_agents')
            .update({ feedback_rules: JSON.parse(JSON.stringify([...currentRules, newRule])) })
            .eq('id', agentId);

          toast.success('Regra de comportamento adicionada!');
          break;
        }

        case 'MISSING_INFO': {
          // Create pending question for wizard
          const patch = classificationResult.patch.wizard_question;
          await supabase.from('agent_pending_questions').insert({
            agent_id: agentId,
            organization_id: organizationId,
            question: patch?.question || `Como responder quando perguntarem sobre: "${customerMessage?.slice(0, 100) || message.content.slice(0, 100)}..."`,
            slot: patch?.slot || 'custom_info',
            source_feedback: idealResponse,
            status: 'pending',
          });
          toast.info('Pergunta criada! Vá às configurações do agente para responder.');
          break;
        }

        case 'FLOW_TOOL': {
          // Update tool triggers
          const { data: agent } = await supabase
            .from('ai_agents')
            .select('tool_triggers')
            .eq('id', agentId)
            .single();

          const currentTriggers = (agent?.tool_triggers as Record<string, string>) || {};
          const patch = classificationResult.patch.flow_tool_update;
          
          if (patch?.trigger && patch?.rule) {
            const updatedTriggers = {
              ...currentTriggers,
              [patch.trigger]: patch.rule,
            };

            await supabase
              .from('ai_agents')
              .update({ tool_triggers: updatedTriggers })
              .eq('id', agentId);

            toast.success('Gatilho de ferramenta atualizado!');
          }
          break;
        }
      }

      // Also add to feedback history for tracking
      const { data: agent } = await supabase
        .from('ai_agents')
        .select('feedback_history')
        .eq('id', agentId)
        .single();

      const currentHistory = (agent?.feedback_history as any[]) || [];
      const newEntry = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        feedback: idealResponse,
        originalMessage: message.content,
        classification: selectedClassification,
        applied: true,
      };

      await supabase
        .from('ai_agents')
        .update({ feedback_history: JSON.parse(JSON.stringify([newEntry, ...currentHistory])) })
        .eq('id', agentId);

      // Reset and close
      setIdealResponse('');
      setStep('input');
      setClassificationResult(null);
      setSelectedClassification(null);
      onOpenChange(false);
      onFeedbackApplied?.();
    } catch (error: any) {
      console.error('Error applying feedback:', error);
      toast.error(error.message || 'Erro ao aplicar feedback');
      setStep('classification');
    } finally {
      setIsApplying(false);
    }
  };

  const handleBack = () => {
    if (step === 'classification') {
      setStep('input');
    }
  };

  const handleClose = () => {
    setIdealResponse('');
    setStep('input');
    setClassificationResult(null);
    setSelectedClassification(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Feedback para o Agente
            {step !== 'input' && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                - {step === 'classification' ? 'Classificação' : 'Aplicando'}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Input */}
        {step === 'input' && (
          <div className="space-y-4">
            {/* Original message */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-purple-500" />
                Mensagem original do agente:
              </Label>
              <div className="p-3 bg-muted rounded-lg text-sm max-h-32 overflow-y-auto">
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

            <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm text-muted-foreground">
                O sistema irá classificar automaticamente o tipo de feedback e aplicar no lugar certo.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Classification */}
        {step === 'classification' && classificationResult && (
          <div className="space-y-4">
            {/* Detected classification */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Tipo de problema detectado:</Label>
                <span className="text-xs text-muted-foreground">
                  Confiança: {Math.round(classificationResult.confidence * 100)}%
                </span>
              </div>

              <RadioGroup
                value={selectedClassification || undefined}
                onValueChange={(v) => setSelectedClassification(v as ClassificationType)}
              >
                {(Object.keys(CLASSIFICATION_INFO) as ClassificationType[]).map((type) => {
                  const info = CLASSIFICATION_INFO[type];
                  const Icon = info.icon;
                  const isSelected = selectedClassification === type;
                  const isDetected = classificationResult.classification === type;

                  return (
                    <div
                      key={type}
                      className={cn(
                        'flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer',
                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                        isDetected && !isSelected && 'border-dashed'
                      )}
                      onClick={() => setSelectedClassification(type)}
                    >
                      <RadioGroupItem value={type} id={type} className="mt-1" />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Icon className={cn('h-4 w-4', info.color)} />
                          <label htmlFor={type} className="font-medium cursor-pointer">
                            {info.label}
                          </label>
                          {isDetected && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                              Detectado
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {info.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>

            {/* Reason */}
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <span className="font-medium">Motivo: </span>
                {classificationResult.reason}
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Applying */}
        {step === 'applying' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Aplicando feedback...</p>
            <Progress value={50} className="w-48" />
          </div>
        )}

        <DialogFooter>
          {step === 'input' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button onClick={handleClassify} disabled={isClassifying || !idealResponse.trim()}>
                {isClassifying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                Analisar Feedback
              </Button>
            </>
          )}

          {step === 'classification' && (
            <>
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <Button onClick={handleApply} disabled={!selectedClassification}>
                <Check className="h-4 w-4 mr-2" />
                Confirmar e Aplicar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
