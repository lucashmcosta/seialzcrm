import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { 
  Send, 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  Circle, 
  Sparkles,
  MessageSquare,
  FileText,
  RefreshCw,
  HelpCircle,
  Shield,
  Package,
  ArrowLeft
} from 'lucide-react';

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
}

type KnowledgeType = 'general' | 'faq_only' | 'policy' | 'product';

interface WizardResponse {
  message: string;
  stage: 'discovery' | 'slots' | 'faq_generation' | 'policy_slots' | 'product_slots' | 'complete';
  nextQuestion: string | null;
  slotUpdates: Record<string, string>;
  missingSlots: string[];
  suggestedQuestions: string[];
  faqAnswered?: { question: string; answer: string };
}

interface KnowledgeWizardChatProps {
  agentId: string | null;
  onComplete: (title: string, content: string) => void;
  onCancel: () => void;
}

const SLOT_LABELS: Record<string, string> = {
  offer: 'O que oferece',
  target_customer: 'Público-alvo',
  includes: 'O que inclui',
  excludes: 'O que não inclui',
  price: 'Investimento',
  timeline: 'Prazo',
  required_inputs: 'Requisitos',
  next_step: 'Próximo passo',
  policies: 'Políticas',
};

const POLICY_SLOT_LABELS: Record<string, string> = {
  refund_policy: 'Política de Reembolso',
  cancellation_policy: 'Política de Cancelamento',
  warranty: 'Garantia',
  terms: 'Termos de Uso',
  privacy: 'Privacidade',
};

const PRODUCT_SLOT_LABELS: Record<string, string> = {
  product_name: 'Nome do Produto',
  description: 'Descrição',
  features: 'Características',
  price: 'Preço',
  availability: 'Disponibilidade',
  target_customer: 'Público-alvo',
};

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  discovery: { label: 'Descoberta', color: 'bg-primary/10 text-primary' },
  slots: { label: 'Coleta de Informações', color: 'bg-secondary text-secondary-foreground' },
  faq_generation: { label: 'Perguntas Frequentes', color: 'bg-accent text-accent-foreground' },
  policy_slots: { label: 'Coleta de Políticas', color: 'bg-secondary text-secondary-foreground' },
  product_slots: { label: 'Detalhes do Produto', color: 'bg-secondary text-secondary-foreground' },
  complete: { label: 'Completo', color: 'bg-success/10 text-success' },
};

const KNOWLEDGE_TYPES: Array<{
  id: KnowledgeType;
  label: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    id: 'general',
    label: 'Geral',
    description: 'Documento completo com todas as informações do negócio',
    icon: FileText,
  },
  {
    id: 'faq_only',
    label: 'Somente FAQs',
    description: 'Adicionar perguntas frequentes à base existente',
    icon: HelpCircle,
  },
  {
    id: 'policy',
    label: 'Políticas',
    description: 'Regras de reembolso, cancelamento, garantias',
    icon: Shield,
  },
  {
    id: 'product',
    label: 'Produto/Serviço',
    description: 'Detalhes específicos de um produto ou serviço',
    icon: Package,
  },
];

export function KnowledgeWizardChat({ agentId, onComplete, onCancel }: KnowledgeWizardChatProps) {
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStage, setCurrentStage] = useState<'discovery' | 'slots' | 'faq_generation' | 'policy_slots' | 'product_slots' | 'complete'>('discovery');
  const [extractedSlots, setExtractedSlots] = useState<Record<string, string>>({});
  const [missingSlots, setMissingSlots] = useState<string[]>(Object.keys(SLOT_LABELS));
  const [suggestedFaqs, setSuggestedFaqs] = useState<string[]>([]);
  const [answeredFaqs, setAnsweredFaqs] = useState<Array<{ question: string; answer: string }>>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [slotsOpen, setSlotsOpen] = useState(true);
  const [finalContent, setFinalContent] = useState<{ title: string; content: string } | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input after AI responds
  useEffect(() => {
    if (!isLoading && inputRef.current && currentStage !== 'complete') {
      inputRef.current.focus();
    }
  }, [isLoading, currentStage]);

  const startWizard = async (type: KnowledgeType) => {
    setKnowledgeType(type);
    setIsLoading(true);
    
    // Set appropriate initial stage and slots based on type
    if (type === 'faq_only') {
      setCurrentStage('faq_generation');
      setMissingSlots([]);
    } else if (type === 'policy') {
      setCurrentStage('policy_slots');
      setMissingSlots(Object.keys(POLICY_SLOT_LABELS));
    } else if (type === 'product') {
      setCurrentStage('product_slots');
      setMissingSlots(Object.keys(PRODUCT_SLOT_LABELS));
    } else {
      setCurrentStage('discovery');
      setMissingSlots(Object.keys(SLOT_LABELS));
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('knowledge-wizard', {
        body: {
          recentMessages: [],
          currentSlots: {},
          userMessage: 'Iniciar wizard para criar conhecimento',
          knowledgeType: type,
        },
      });

      if (error) throw error;

      const response = data as WizardResponse;
      setMessages([{ role: 'assistant', content: response.message }]);
      setCurrentStage(response.stage);
      if (response.slotUpdates) {
        setExtractedSlots(prev => ({ ...prev, ...response.slotUpdates }));
      }
      if (response.missingSlots) {
        setMissingSlots(response.missingSlots);
      }
      if (response.suggestedQuestions && response.suggestedQuestions.length > 0) {
        setSuggestedFaqs(response.suggestedQuestions);
      }
    } catch (error) {
      console.error('Error starting wizard:', error);
      toast.error('Erro ao iniciar o assistente');
      // Fallback message based on type
      const fallbackMessages: Record<KnowledgeType, string> = {
        general: 'Olá! O que sua empresa oferece? (produto, serviço, consultoria...)',
        faq_only: 'Olá! Vamos criar FAQs para sua base de conhecimento. Sobre qual produto ou serviço você quer criar perguntas frequentes?',
        policy: 'Olá! Vamos documentar suas políticas. Qual política você gostaria de definir primeiro? (reembolso, cancelamento, garantia...)',
        product: 'Olá! Vamos criar a documentação de um produto/serviço. Qual é o nome do produto ou serviço?',
      };
      setMessages([{ role: 'assistant', content: fallbackMessages[type] }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !knowledgeType) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    // Add user message to chat
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Limit to last 10 messages
      const recentMessages = newMessages.slice(-10);

      const { data, error } = await supabase.functions.invoke('knowledge-wizard', {
        body: {
          recentMessages,
          currentSlots: extractedSlots,
          userMessage,
          knowledgeType,
        },
      });

      if (error) {
        // Handle specific errors
        if (error.message?.includes('429') || error.message?.includes('rate')) {
          toast.error('Taxa de requisições excedida. Aguarde um momento.');
          return;
        }
        if (error.message?.includes('402')) {
          toast.error('Créditos insuficientes. Adicione créditos ao seu workspace.');
          return;
        }
        throw error;
      }

      const response = data as WizardResponse;

      // Add AI response to chat
      setMessages(prev => [...prev, { role: 'assistant', content: response.message }]);
      
      // Update state
      setCurrentStage(response.stage);
      
      if (response.slotUpdates && Object.keys(response.slotUpdates).length > 0) {
        setExtractedSlots(prev => ({ ...prev, ...response.slotUpdates }));
      }
      
      if (response.missingSlots) {
        setMissingSlots(response.missingSlots);
      }
      
      if (response.suggestedQuestions && response.suggestedQuestions.length > 0) {
        setSuggestedFaqs(response.suggestedQuestions);
      }
      
      // Capture FAQ answered during faq_generation stage
      if (response.faqAnswered && response.faqAnswered.question && response.faqAnswered.answer) {
        setAnsweredFaqs(prev => [...prev, response.faqAnswered!]);
        // Remove from suggested if present
        if (response.suggestedQuestions) {
          setSuggestedFaqs(response.suggestedQuestions);
        }
      }

    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Erro ao enviar mensagem. Tente novamente.');
      // Remove the user message if there was an error
      setMessages(messages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFaqClick = (faq: string) => {
    setInputValue(faq);
    inputRef.current?.focus();
  };

  const handleSynthesize = async () => {
    if (!knowledgeType) return;
    
    setIsSynthesizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('synthesize-knowledge', {
        body: {
          slots: extractedSlots,
          faqs: answeredFaqs,
          knowledgeType,
        },
      });

      if (error) throw error;

      setFinalContent({
        title: data.title,
        content: data.content,
      });
    } catch (error) {
      console.error('Error synthesizing:', error);
      toast.error('Erro ao gerar conteúdo. Tente novamente.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleSave = () => {
    if (finalContent) {
      onComplete(finalContent.title, finalContent.content);
    }
  };

  const handleBack = () => {
    setKnowledgeType(null);
    setMessages([]);
    setExtractedSlots({});
    setAnsweredFaqs([]);
    setSuggestedFaqs([]);
    setFinalContent(null);
    setCurrentStage('discovery');
  };

  // Get appropriate slot labels based on knowledge type
  const getSlotLabels = () => {
    if (knowledgeType === 'policy') return POLICY_SLOT_LABELS;
    if (knowledgeType === 'product') return PRODUCT_SLOT_LABELS;
    return SLOT_LABELS;
  };

  const currentSlotLabels = getSlotLabels();
  const filledSlotsCount = Object.keys(extractedSlots).filter(k => extractedSlots[k]).length;
  const totalSlots = Object.keys(currentSlotLabels).length;
  const progressPercent = knowledgeType === 'faq_only' 
    ? (answeredFaqs.length / 3) * 100 
    : (filledSlotsCount / totalSlots) * 100;

  // Type selection screen
  if (!knowledgeType) {
    return (
      <div className="flex flex-col h-full max-h-[70vh]">
        <div className="flex items-center gap-3 p-4 border-b">
          <div className="p-2 rounded-full bg-primary/10">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Criar Base de Conhecimento</h3>
            <p className="text-sm text-muted-foreground">Escolha o tipo de conteúdo</p>
          </div>
        </div>

        <div className="flex-1 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {KNOWLEDGE_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => startWizard(type.id)}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 hover:border-primary/50 transition-all text-left group"
                >
                  <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{type.label}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end p-4 border-t bg-muted/30">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[70vh]">
      {/* Header with stage indicator */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="p-2 rounded-full bg-primary/10">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">
              {KNOWLEDGE_TYPES.find(t => t.id === knowledgeType)?.label}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={STAGE_LABELS[currentStage]?.color || 'bg-muted'}>
                {STAGE_LABELS[currentStage]?.label || currentStage}
              </Badge>
              {knowledgeType !== 'faq_only' && (
                <span className="text-xs text-muted-foreground">
                  {filledSlotsCount}/{totalSlots} campos
                </span>
              )}
              {knowledgeType === 'faq_only' && (
                <span className="text-xs text-muted-foreground">
                  {answeredFaqs.length} FAQs
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-300" 
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Suggested FAQs */}
          {currentStage === 'faq_generation' && suggestedFaqs.length > 0 && (
            <div className="px-4 py-2 border-t bg-muted/30">
              <p className="text-xs text-muted-foreground mb-2">Perguntas sugeridas (clique para usar):</p>
              <div className="flex flex-wrap gap-2">
                {suggestedFaqs.slice(0, 5).map((faq, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleFaqClick(faq)}
                    className="text-xs bg-background hover:bg-accent px-2 py-1 rounded border transition-colors"
                  >
                    {faq.length > 40 ? faq.slice(0, 40) + '...' : faq}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input area or Complete actions */}
          {currentStage !== 'complete' ? (
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Digite sua resposta..."
                  disabled={isLoading}
                />
                <Button onClick={handleSend} disabled={isLoading || !inputValue.trim()}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 border-t space-y-4">
              {!finalContent ? (
                <div className="text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Check className="h-5 w-5 text-success" />
                    <span>Todas as informações coletadas!</span>
                  </div>
                  <Button onClick={handleSynthesize} disabled={isSynthesizing} className="w-full">
                    {isSynthesizing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Gerando documento...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Gerar Conhecimento
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      value={finalContent.title}
                      onChange={(e) => setFinalContent({ ...finalContent, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Conteúdo (preview)</Label>
                    <Textarea
                      value={finalContent.content}
                      onChange={(e) => setFinalContent({ ...finalContent, content: e.target.value })}
                      rows={6}
                      className="text-xs font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setFinalContent(null)} className="flex-1">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerar
                    </Button>
                    <Button onClick={handleSave} className="flex-1">
                      <FileText className="mr-2 h-4 w-4" />
                      Salvar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Slots panel - only show for non-faq types */}
        {knowledgeType !== 'faq_only' && (
          <div className="w-64 border-l bg-muted/30 hidden md:block">
            <Collapsible open={slotsOpen} onOpenChange={setSlotsOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50">
                <span className="text-sm font-medium">Informações Coletadas</span>
                {slotsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-3 space-y-2">
                  {Object.entries(currentSlotLabels).map(([key, label]) => {
                    const value = extractedSlots[key];
                    const isFilled = value && value.trim();
                    return (
                      <div key={key} className="flex items-start gap-2">
                        {isFilled ? (
                          <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${isFilled ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {label}
                          </p>
                          {isFilled && (
                            <p className="text-xs text-muted-foreground truncate" title={value}>
                              {value.length > 50 ? value.slice(0, 50) + '...' : value}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* FAQs Respondidas */}
                  {answeredFaqs.length > 0 && (
                    <div className="border-t pt-3 mt-3">
                      <p className="text-xs font-medium text-foreground mb-2">
                        FAQs Respondidas ({answeredFaqs.length})
                      </p>
                      {answeredFaqs.map((faq, idx) => (
                        <div key={idx} className="mb-2 pl-2 border-l-2 border-primary/30">
                          <p className="text-xs font-medium text-foreground truncate" title={faq.question}>
                            {faq.question.length > 35 ? faq.question.slice(0, 35) + '...' : faq.question}
                          </p>
                          <p className="text-xs text-muted-foreground truncate" title={faq.answer}>
                            {faq.answer.length > 40 ? faq.answer.slice(0, 40) + '...' : faq.answer}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* FAQs panel for faq_only type */}
        {knowledgeType === 'faq_only' && (
          <div className="w-64 border-l bg-muted/30 hidden md:block">
            <div className="p-3">
              <span className="text-sm font-medium">FAQs Coletadas</span>
              <div className="mt-3 space-y-2">
                {answeredFaqs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma FAQ respondida ainda</p>
                ) : (
                  answeredFaqs.map((faq, idx) => (
                    <div key={idx} className="pl-2 border-l-2 border-primary/30">
                      <p className="text-xs font-medium text-foreground truncate" title={faq.question}>
                        {faq.question.length > 35 ? faq.question.slice(0, 35) + '...' : faq.question}
                      </p>
                      <p className="text-xs text-muted-foreground truncate" title={faq.answer}>
                        {faq.answer.length > 40 ? faq.answer.slice(0, 40) + '...' : faq.answer}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center p-3 border-t bg-muted/30">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <span className="text-xs text-muted-foreground">
          Pressione Enter para enviar
        </span>
      </div>
    </div>
  );
}
