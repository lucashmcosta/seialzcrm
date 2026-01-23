import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Loader2, RefreshCw, ArrowLeft, ArrowRight, Check, Sparkles, 
  MessageSquare, Target, FileText, MessageSquarePlus, History, 
  Trash2, Send, Bot, User, ThumbsUp, ThumbsDown, Beaker, Wrench,
  SlidersHorizontal, CheckSquare, Database, MessageCircleWarning,
  Smile, Briefcase
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// ==================== TYPES ====================

interface WizardData {
  // Step 1 - Canal e Objetivo
  channel: 'whatsapp' | 'sms' | 'webchat';
  objective: 'sell' | 'schedule' | 'support' | 'qualify';
  
  // Step 2 - Tom e Formato
  responseLength: number; // 0-100
  formality: 'informal' | 'professional';
  emojis: 'yes' | 'no' | 'occasional';
  maxQuestionsPerMessage: number;
  
  // Step 3 - Escopo do Agente
  scope: {
    howItWorks: boolean;
    documents: boolean;
    deadlines: boolean;
    pricing: boolean;
    refund: boolean;
    eligibility: boolean;
    generalTopics: boolean;
  };
  
  // Step 4 - RAG e Intents
  ragIntents: string[];
  noRagBehavior: 'ask_more_info' | 'say_dont_know' | 'offer_human';
  
  // Step 5 - Mensagens de Fallback
  fallbacks: {
    noRag: string;
    outOfScope: string;
    handoff: string;
  };
  
  // Legacy fields for compatibility and data tab
  companyName: string;
  companySegment: string;
  companyDescription: string;
  products: string;
  differentials: string;
  generatedPrompt: string;
}

interface FeedbackEntry {
  id: string;
  date: string;
  feedback: string;
  applied: boolean;
}

interface SDRAgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingAgent: {
    id: string;
    name: string;
    is_enabled?: boolean;
    custom_instructions: string | null;
    wizard_data: any;
    feedback_history?: FeedbackEntry[];
    enabled_tools?: string[];
    ai_provider?: string | null;
    ai_model?: string | null;
    max_messages_per_conversation?: number | null;
  } | null;
  organizationId: string;
  onSuccess: () => void;
}

// ==================== CONSTANTS ====================

const AI_PROVIDERS = [
  { value: 'auto', label: 'Automático', description: 'Usa integração padrão da organização' },
  { value: 'lovable-ai', label: 'Lovable AI (Gemini)', description: 'Google Gemini - rápido e econômico' },
  { value: 'claude-ai', label: 'Claude (Anthropic)', description: 'Excelente raciocínio e nuance' },
  { value: 'openai-gpt', label: 'GPT (OpenAI)', description: 'Versátil e poderoso' },
];

const AI_MODELS: Record<string, { value: string; label: string }[]> = {
  'lovable-ai': [
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (Recomendado)' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Mais preciso)' },
  ],
  'claude-ai': [
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4 (Recomendado)' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Sonnet 3.5' },
    { value: 'claude-3-5-haiku-20241022', label: 'Haiku 3.5 (Mais rápido)' },
  ],
  'openai-gpt': [
    { value: 'gpt-5.2-pro', label: 'GPT-5.2 Pro (Último lançamento)' },
    { value: 'gpt-5.2-mini', label: 'GPT-5.2 Mini' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'o3', label: 'o3 (Raciocínio Superior)' },
    { value: 'o3-mini', label: 'o3-mini (Raciocínio Rápido)' },
    { value: 'o1', label: 'o1 (Raciocínio Complexo)' },
    { value: 'o1-mini', label: 'o1-mini' },
    { value: 'gpt-4.5-preview', label: 'GPT-4.5 Preview' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Econômico)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (128k contexto)' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Mais barato)' },
  ],
};

const AVAILABLE_TOOLS = [
  { id: 'update_contact', name: 'Atualizar Contato', description: 'Permite corrigir nome, email, telefone e empresa do contato' },
  { id: 'create_opportunity', name: 'Criar Oportunidade', description: 'Cria negócio quando cliente demonstra interesse' },
  { id: 'create_task', name: 'Criar Tarefa', description: 'Agenda follow-ups e ações futuras para a equipe' },
  { id: 'transfer_to_human', name: 'Transferir para Humano', description: 'Passa a conversa para atendimento humano' },
  { id: 'schedule_meeting', name: 'Agendar Reunião', description: 'Agenda reuniões e demonstrações com o cliente' },
  { id: 'save_memory', name: 'Salvar Memória', description: 'Salva informações importantes para lembrar em futuras conversas' },
  { id: 'schedule_follow_up', name: 'Agendar Follow-up', description: 'Agenda mensagem automática para data futura' },
  { id: 'send_payment_link', name: 'Enviar Link de Pagamento', description: 'Gera e envia link de pagamento' },
  { id: 'update_qualification', name: 'Atualizar Qualificação', description: 'Registra dados de qualificação do lead' },
];

const STEPS = [
  { id: 1, title: 'Canal e Objetivo', icon: MessageSquare },
  { id: 2, title: 'Tom e Formato', icon: SlidersHorizontal },
  { id: 3, title: 'Escopo', icon: CheckSquare },
  { id: 4, title: 'Base de Conhecimento', icon: Database },
  { id: 5, title: 'Fallbacks', icon: MessageCircleWarning },
];

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp', description: 'Mensagens instantâneas, curtas e diretas' },
  { value: 'sms', label: 'SMS', description: 'Mensagens muito curtas (160 caracteres)' },
  { value: 'webchat', label: 'Chat Web', description: 'Chat no site, pode ser mais detalhado' },
];

const OBJECTIVES = [
  { value: 'sell', label: 'Vender / Tirar dúvidas', description: 'Responder perguntas e conduzir para venda' },
  { value: 'schedule', label: 'Agendar reuniões', description: 'Marcar demonstrações e consultas' },
  { value: 'support', label: 'Suporte ao cliente', description: 'Resolver problemas e dúvidas' },
  { value: 'qualify', label: 'Qualificar leads', description: 'Identificar interesse e perfil' },
];

const SCOPE_OPTIONS = [
  { key: 'howItWorks', label: 'Como funciona', description: 'Explica o processo geral do serviço' },
  { key: 'documents', label: 'Documentos necessários', description: 'Informa sobre documentação' },
  { key: 'deadlines', label: 'Prazos', description: 'Responde sobre tempos estimados' },
  { key: 'pricing', label: 'Preço e pacotes', description: 'Fala sobre valores e planos' },
  { key: 'refund', label: 'Reembolso/Cancelamento', description: 'Políticas de devolução' },
  { key: 'eligibility', label: 'Elegibilidade', description: 'Verifica se cliente se qualifica' },
  { key: 'generalTopics', label: 'Assuntos gerais', description: 'Conversa sobre outros temas' },
];

const RAG_INTENTS = [
  { value: 'pricing', label: 'Preços e Pacotes' },
  { value: 'documents', label: 'Documentos Necessários' },
  { value: 'deadlines', label: 'Prazos' },
  { value: 'refund', label: 'Política de Reembolso' },
  { value: 'faq', label: 'FAQ Geral' },
  { value: 'products', label: 'Produtos e Serviços' },
];

const NO_RAG_BEHAVIORS = [
  { value: 'ask_more_info', label: 'Pedir mais informações', description: 'Não inventar; pedir 1 info adicional' },
  { value: 'say_dont_know', label: 'Dizer que não sabe', description: 'Ser honesto sobre a limitação' },
  { value: 'offer_human', label: 'Oferecer atendimento humano', description: 'Passar para um consultor' },
];

const SEGMENTS = [
  { value: 'saas', label: 'Tecnologia / SaaS' },
  { value: 'services', label: 'Serviços Profissionais' },
  { value: 'retail', label: 'Varejo / E-commerce' },
  { value: 'industry', label: 'Indústria / Manufatura' },
  { value: 'education', label: 'Educação' },
  { value: 'health', label: 'Saúde' },
  { value: 'finance', label: 'Finanças / Seguros' },
  { value: 'real_estate', label: 'Imobiliário' },
  { value: 'other', label: 'Outro' },
];

const DEFAULT_FALLBACKS = {
  noRag: 'Não encontrei essa informação aqui. Pode me dar mais detalhes sobre o que precisa?',
  outOfScope: 'Eu só posso te ajudar com assuntos relacionados ao nosso serviço. Quer falar sobre isso?',
  handoff: 'Entendi! Vou pedir para um consultor entrar em contato com você. Qual o melhor horário?',
};

const initialWizardData: WizardData = {
  channel: 'whatsapp',
  objective: 'sell',
  responseLength: 30,
  formality: 'informal',
  emojis: 'occasional',
  maxQuestionsPerMessage: 1,
  scope: {
    howItWorks: true,
    documents: true,
    deadlines: true,
    pricing: true,
    refund: false,
    eligibility: false,
    generalTopics: false,
  },
  ragIntents: ['pricing', 'products', 'faq'],
  noRagBehavior: 'ask_more_info',
  fallbacks: { ...DEFAULT_FALLBACKS },
  companyName: '',
  companySegment: 'saas',
  companyDescription: '',
  products: '',
  differentials: '',
  generatedPrompt: '',
};

// ==================== HELPER FUNCTIONS ====================

const getLengthRules = (value: number): string => {
  if (value <= 30) return 'Respostas CURTAS: 1-2 bolhas de mensagem, máximo 150 caracteres por bolha. Seja direto e objetivo.';
  if (value <= 70) return 'Respostas MÉDIAS: 2-3 bolhas de mensagem, até 300 caracteres por bolha. Equilibre informação e concisão.';
  return 'Respostas COMPLETAS: pode usar até 500 caracteres quando necessário para explicar bem.';
};

const getLengthLabel = (value: number): string => {
  if (value <= 30) return 'Curto';
  if (value <= 70) return 'Médio';
  return 'Detalhado';
};

const getScopeRules = (scope: WizardData['scope']): { can: string[]; cannot: string[] } => {
  const can: string[] = [];
  const cannot: string[] = [];
  
  if (scope.howItWorks) can.push('Explicar como o serviço/produto funciona');
  else cannot.push('Explicar processos internos do serviço');
  
  if (scope.documents) can.push('Informar sobre documentação necessária');
  else cannot.push('Falar sobre documentos requeridos');
  
  if (scope.deadlines) can.push('Responder sobre prazos e tempos estimados');
  else cannot.push('Prometer ou mencionar prazos');
  
  if (scope.pricing) can.push('Discutir preços, pacotes e valores');
  else cannot.push('Mencionar valores ou preços - direcionar para reunião');
  
  if (scope.refund) can.push('Explicar políticas de reembolso e cancelamento');
  else cannot.push('Falar sobre reembolsos ou cancelamentos');
  
  if (scope.eligibility) can.push('Verificar se o cliente se qualifica para o serviço');
  else cannot.push('Avaliar elegibilidade do cliente');
  
  if (scope.generalTopics) can.push('Conversar sobre assuntos gerais');
  else cannot.push('Desviar para assuntos fora do escopo do serviço');
  
  return { can, cannot };
};

const generatePromptFromWizard = (data: WizardData): string => {
  const { can, cannot } = getScopeRules(data.scope);
  
  const channelLabel = CHANNELS.find(c => c.value === data.channel)?.label || data.channel;
  const objectiveLabel = OBJECTIVES.find(o => o.value === data.objective)?.label || data.objective;
  
  const formalityText = data.formality === 'professional' 
    ? 'Tom PROFISSIONAL e formal. Use linguagem corporativa.'
    : 'Tom INFORMAL e amigável. Use linguagem natural e acessível.';
    
  const emojisText = data.emojis === 'yes' 
    ? 'Use emojis livremente para tornar a conversa mais leve 😊'
    : data.emojis === 'no'
    ? 'NÃO use emojis nas mensagens.'
    : 'Use emojis ocasionalmente, com moderação (1-2 por mensagem quando apropriado).';

  let prompt = `## Identidade
Você é um assistente virtual de ${data.companyName || '[EMPRESA]'} que atende via ${channelLabel}.
${data.companyDescription ? `\nSobre a empresa: ${data.companyDescription}` : ''}

## Objetivo Principal
${objectiveLabel}

## Tom de Comunicação
${formalityText}
${emojisText}

## Formato das Respostas
${getLengthRules(data.responseLength)}
- Faça no máximo ${data.maxQuestionsPerMessage} pergunta(s) por mensagem
- Mensagens curtas são melhores para ${channelLabel}

## ✅ PODE fazer:
${can.map(c => `- ${c}`).join('\n')}

## ❌ NÃO PODE fazer:
${cannot.map(c => `- ${c}`).join('\n')}

## Produtos/Serviços
${data.products || 'Aguardando informações sobre produtos/serviços.'}

${data.differentials ? `## Diferenciais\n${data.differentials}` : ''}

## Quando não souber responder
${data.noRagBehavior === 'ask_more_info' 
  ? `Peça mais informações ao cliente. Exemplo: "${data.fallbacks.noRag}"`
  : data.noRagBehavior === 'say_dont_know'
  ? `Seja honesto sobre a limitação. Exemplo: "${data.fallbacks.noRag}"`
  : `Ofereça atendimento humano. Exemplo: "${data.fallbacks.handoff}"`
}

## Mensagem para assuntos fora do escopo
"${data.fallbacks.outOfScope}"

## Mensagem para transferir para humano
"${data.fallbacks.handoff}"

## Regras Importantes
✅ Sempre responda em português brasileiro
✅ Mantenha o contexto da conversa
✅ Personalize usando o nome do cliente quando disponível
❌ Nunca invente informações que não estão na sua base de conhecimento
❌ Nunca prometa algo que a empresa não possa cumprir`;

  return prompt;
};

// ==================== MAIN COMPONENT ====================

export function SDRAgentWizard({ 
  open, 
  onOpenChange, 
  existingAgent, 
  organizationId, 
  onSuccess 
}: SDRAgentWizardProps) {
  const isEditMode = !!(existingAgent?.id && existingAgent?.custom_instructions);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [currentStep, setCurrentStep] = useState(isEditMode ? 5 : 1);
  const [activeTab, setActiveTab] = useState<'prompt' | 'feedback' | 'wizard' | 'test' | 'tools'>('prompt');
  const [wizardData, setWizardData] = useState<WizardData>(() => {
    if (existingAgent?.wizard_data) {
      // Merge existing data with defaults to handle new fields
      return {
        ...initialWizardData,
        ...existingAgent.wizard_data,
        generatedPrompt: existingAgent.custom_instructions || existingAgent.wizard_data.generatedPrompt || '',
        scope: {
          ...initialWizardData.scope,
          ...(existingAgent.wizard_data.scope || {}),
        },
        fallbacks: {
          ...DEFAULT_FALLBACKS,
          ...(existingAgent.wizard_data.fallbacks || {}),
        },
      };
    }
    return initialWizardData;
  });
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackEntry[]>(
    existingAgent?.feedback_history || []
  );
  const [enabledTools, setEnabledTools] = useState<string[]>(
    existingAgent?.enabled_tools || ['update_contact', 'transfer_to_human']
  );
  const [aiProvider, setAiProvider] = useState<string>(existingAgent?.ai_provider || 'auto');
  const [aiModel, setAiModel] = useState<string>(existingAgent?.ai_model || '');
  const [maxMessages, setMaxMessages] = useState<number>(existingAgent?.max_messages_per_conversation ?? 10);
  const [agentName, setAgentName] = useState<string>(existingAgent?.name || '');
  const [newFeedback, setNewFeedback] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Test mode state
  interface TestMessage {
    id: string;
    role: 'user' | 'agent';
    content: string;
  }
  const [testMessages, setTestMessages] = useState<TestMessage[]>([]);
  const [testInput, setTestInput] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  const toggleTool = (toolId: string, enabled: boolean) => {
    setEnabledTools(prev => 
      enabled ? [...prev, toolId] : prev.filter(t => t !== toolId)
    );
  };

  // Reset state when dialog opens/closes or agent changes
  useEffect(() => {
    if (open) {
      const isEdit = !!(existingAgent?.id && existingAgent?.custom_instructions);
      setCurrentStep(isEdit ? 5 : 1);
      setActiveTab('prompt');
      setNewFeedback('');
      setTestMessages([]);
      setTestInput('');
      if (existingAgent?.wizard_data) {
        setWizardData({
          ...initialWizardData,
          ...existingAgent.wizard_data,
          generatedPrompt: existingAgent.custom_instructions || existingAgent.wizard_data.generatedPrompt || '',
          scope: {
            ...initialWizardData.scope,
            ...(existingAgent.wizard_data.scope || {}),
          },
          fallbacks: {
            ...DEFAULT_FALLBACKS,
            ...(existingAgent.wizard_data.fallbacks || {}),
          },
        });
      } else {
        setWizardData(initialWizardData);
      }
      
      setFeedbackHistory(existingAgent?.feedback_history || []);
      setEnabledTools(existingAgent?.enabled_tools || ['update_contact', 'transfer_to_human']);
      setAiProvider(existingAgent?.ai_provider || 'auto');
      setAiModel(existingAgent?.ai_model || '');
      setMaxMessages(existingAgent?.max_messages_per_conversation ?? 10);
      setAgentName(existingAgent?.name || '');
    }
  }, [open, existingAgent]);

  const updateField = <K extends keyof WizardData>(field: K, value: WizardData[K]) => {
    setWizardData(prev => ({ ...prev, [field]: value }));
  };

  const updateScope = (key: keyof WizardData['scope'], value: boolean) => {
    setWizardData(prev => ({
      ...prev,
      scope: { ...prev.scope, [key]: value },
    }));
  };

  const updateFallback = (key: keyof WizardData['fallbacks'], value: string) => {
    setWizardData(prev => ({
      ...prev,
      fallbacks: { ...prev.fallbacks, [key]: value },
    }));
  };

  const toggleRagIntent = (intent: string) => {
    setWizardData(prev => ({
      ...prev,
      ragIntents: prev.ragIntents.includes(intent)
        ? prev.ragIntents.filter(i => i !== intent)
        : [...prev.ragIntents, intent],
    }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return true; // Channel and objective have defaults
      case 2:
        return true; // All have defaults
      case 3:
        return Object.values(wizardData.scope).some(v => v); // At least one scope enabled
      case 4:
        return true;
      case 5:
        return wizardData.fallbacks.noRag.trim() && wizardData.fallbacks.outOfScope.trim();
      default:
        return false;
    }
  };

  const generatePrompt = async (): Promise<string> => {
    // First, generate from wizard data
    const wizardPrompt = generatePromptFromWizard(wizardData);
    
    // If we have company info, enhance with AI
    if (wizardData.companyName && wizardData.products) {
      setIsGenerating(true);
      try {
        const { data, error } = await supabase.functions.invoke('ai-generate', {
          body: {
            action: 'generate_agent_prompt',
            context: {
              companyName: wizardData.companyName,
              companySegment: SEGMENTS.find(s => s.value === wizardData.companySegment)?.label || wizardData.companySegment,
              companyDescription: wizardData.companyDescription,
              products: wizardData.products,
              differentials: wizardData.differentials,
              goal: OBJECTIVES.find(o => o.value === wizardData.objective)?.label || wizardData.objective,
              tone: wizardData.formality,
              channel: CHANNELS.find(c => c.value === wizardData.channel)?.label || wizardData.channel,
              responseLength: getLengthLabel(wizardData.responseLength),
              scope: wizardData.scope,
              fallbacks: wizardData.fallbacks,
            },
          },
        });

        if (error) throw error;

        if (data?.content) {
          updateField('generatedPrompt', data.content);
          return data.content;
        } else {
          updateField('generatedPrompt', wizardPrompt);
          return wizardPrompt;
        }
      } catch (error: any) {
        console.error('Error generating prompt:', error);
        // Fall back to wizard-generated prompt
        updateField('generatedPrompt', wizardPrompt);
        toast.info('Prompt gerado localmente. Configure uma integração de IA para prompts mais detalhados.');
        return wizardPrompt;
      } finally {
        setIsGenerating(false);
      }
    } else {
      updateField('generatedPrompt', wizardPrompt);
      return wizardPrompt;
    }
  };

  const applyFeedback = async () => {
    if (!newFeedback.trim()) {
      toast.error('Digite um feedback para aplicar');
      return;
    }

    if (!wizardData.generatedPrompt.trim()) {
      toast.error('Não há prompt para refinar');
      return;
    }

    setIsRefining(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: {
          action: 'refine_agent_prompt',
          context: {
            currentPrompt: wizardData.generatedPrompt,
            feedback: newFeedback,
          },
        },
      });

      if (error) throw error;

      if (data?.content) {
        updateField('generatedPrompt', data.content);
        
        const newEntry: FeedbackEntry = {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          feedback: newFeedback,
          applied: true,
        };
        setFeedbackHistory(prev => [newEntry, ...prev]);
        setNewFeedback('');
        setActiveTab('prompt');
        toast.success('Feedback aplicado! Revise o prompt atualizado.');
      }
    } catch (error: any) {
      console.error('Error refining prompt:', error);
      toast.error(error.message || 'Erro ao aplicar feedback');
    } finally {
      setIsRefining(false);
    }
  };

  const removeFeedbackEntry = (id: string) => {
    setFeedbackHistory(prev => prev.filter(f => f.id !== id));
  };

  // Test mode simulation
  const simulateMessage = async () => {
    if (!testInput.trim() || !existingAgent?.id) return;
    
    const userMessage: TestMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: testInput,
    };
    setTestMessages(prev => [...prev, userMessage]);
    setTestInput('');
    setIsSimulating(true);
    
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent-respond', {
        body: {
          agentId: existingAgent.id,
          contactId: 'test-contact',
          threadId: 'test-thread',
          message: testInput,
          isTestMode: true,
        },
      });
      
      if (error) throw error;
      
      if (data?.response) {
        const agentMessage: TestMessage = {
          id: crypto.randomUUID(),
          role: 'agent',
          content: data.response,
        };
        setTestMessages(prev => [...prev, agentMessage]);
        
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (error: any) {
      console.error('Error simulating:', error);
      toast.error(error.message || 'Erro ao simular resposta. Verifique se você tem uma integração de IA configurada.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleTestFeedback = async (testMessage: TestMessage, isPositive: boolean) => {
    if (isPositive) {
      toast.success('Resposta marcada como positiva!');
      return;
    }
    
    const feedback = prompt('Como o agente deveria ter respondido?');
    if (!feedback) return;
    
    try {
      const formattedFeedback = `Quando o cliente disse algo similar a "${testMessages.find(m => m.role === 'user' && testMessages.indexOf(m) < testMessages.indexOf(testMessage))?.content || 'mensagem do cliente'}", ao invés de responder "${testMessage.content.slice(0, 100)}...", responder: "${feedback}"`;
      
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: {
          action: 'refine_agent_prompt',
          context: {
            currentPrompt: wizardData.generatedPrompt,
            feedback: formattedFeedback,
          },
        },
      });
      
      if (error) throw error;
      
      if (data?.content) {
        updateField('generatedPrompt', data.content);
        
        const newEntry: FeedbackEntry = {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          feedback: formattedFeedback,
          applied: true,
        };
        setFeedbackHistory(prev => [newEntry, ...prev]);
        toast.success('Feedback aplicado! O prompt foi atualizado.');
      }
    } catch (error: any) {
      console.error('Error applying feedback:', error);
      toast.error(error.message || 'Erro ao aplicar feedback');
    }
  };

  const clearTestConversation = () => {
    setTestMessages([]);
  };

  const handleNext = async () => {
    if (currentStep === 5) {
      // Final step - generate prompt
      if (!wizardData.generatedPrompt) {
        await generatePrompt();
      }
    } else if (currentStep < 5) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSave = async () => {
    // Generate prompt if not yet generated - capture the returned value
    let promptToSave = wizardData.generatedPrompt.trim();
    if (!promptToSave) {
      promptToSave = await generatePrompt();
    }
    
    if (!promptToSave.trim()) {
      toast.error('O prompt do agente não pode estar vazio');
      return;
    }

    setIsSaving(true);
    try {
      const goalLabel = OBJECTIVES.find(o => o.value === wizardData.objective)?.label || 'Atender clientes';
      
      const agentData = {
        organization_id: organizationId,
        name: agentName.trim() || `Agente ${wizardData.companyName || 'SDR'}`,
        custom_instructions: promptToSave,
        wizard_data: JSON.parse(JSON.stringify({ ...wizardData, generatedPrompt: promptToSave })),
        feedback_history: JSON.parse(JSON.stringify(feedbackHistory)),
        enabled_tools: enabledTools,
        is_enabled: existingAgent?.is_enabled ?? false,
        goal: goalLabel,
        tone: wizardData.formality,
        ai_provider: aiProvider,
        ai_model: aiProvider !== 'auto' ? aiModel : null,
        max_messages_per_conversation: maxMessages,
      };

      if (existingAgent?.id) {
        const { error } = await supabase
          .from('ai_agents')
          .update(agentData)
          .eq('id', existingAgent.id);

        if (error) throw error;
        toast.success('Agente atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('ai_agents')
          .insert([agentData]);

        if (error) throw error;
        toast.success('Agente SDR criado com sucesso!');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving agent:', error);
      toast.error(error.message || 'Erro ao salvar agente');
    } finally {
      setIsSaving(false);
    }
  };

  const progress = (currentStep / 5) * 100;

  // ==================== EDIT MODE TABS ====================
  
  const renderEditMode = () => (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1">
      <TabsList className="w-full grid grid-cols-5">
        <TabsTrigger value="prompt" className="gap-2">
          <FileText className="h-4 w-4" />
          Prompt
        </TabsTrigger>
        <TabsTrigger value="tools" className="gap-2">
          <Wrench className="h-4 w-4" />
          Tools
        </TabsTrigger>
        <TabsTrigger value="test" className="gap-2">
          <Beaker className="h-4 w-4" />
          Testar
        </TabsTrigger>
        <TabsTrigger value="feedback" className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          Feedback
        </TabsTrigger>
        <TabsTrigger value="wizard" className="gap-2">
          <History className="h-4 w-4" />
          Dados
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tools" className="mt-4 space-y-6">
        {/* AI Model Selection */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <div>
            <Label className="text-base font-medium">Modelo de IA</Label>
            <p className="text-sm text-muted-foreground">
              Escolha qual modelo de IA o agente usará para responder
            </p>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={aiProvider} onValueChange={(v) => { setAiProvider(v); setAiModel(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o provider" />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map(provider => (
                    <SelectItem key={provider.value} value={provider.value}>
                      <div className="flex flex-col">
                        <span>{provider.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {AI_PROVIDERS.find(p => p.value === aiProvider)?.description}
              </p>
            </div>
            
            {aiProvider !== 'auto' && AI_MODELS[aiProvider] && (
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Select value={aiModel} onValueChange={setAiModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS[aiProvider].map(model => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Conversation Limits */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <div>
            <Label className="text-base font-medium">Limites de Conversa</Label>
            <p className="text-sm text-muted-foreground">
              Configure limites para as conversas do agente
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Máximo de mensagens por conversa</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={100}
                value={maxMessages}
                onChange={(e) => setMaxMessages(Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))}
                className="w-24"
              />
              <p className="text-sm text-muted-foreground">
                O agente para de responder após este número de mensagens
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Recomendado: 10-30 mensagens. Evita loops e custos excessivos.
            </p>
          </div>
        </div>

        {/* Tools */}
        <div>
          <Label className="text-base font-medium">Ferramentas do Agente</Label>
          <p className="text-sm text-muted-foreground mb-4">
            Habilite as ações que o agente pode executar automaticamente
          </p>
        </div>
        
        <div className="space-y-3">
          {AVAILABLE_TOOLS.map(tool => (
            <div 
              key={tool.id} 
              className="flex items-center justify-between p-4 border rounded-lg bg-card"
            >
              <div className="space-y-1">
                <p className="font-medium text-sm">{tool.name}</p>
                <p className="text-xs text-muted-foreground">{tool.description}</p>
              </div>
              <Switch
                checked={enabledTools.includes(tool.id)}
                onCheckedChange={(checked) => toggleTool(tool.id, checked)}
              />
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="prompt" className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Instruções do Agente</Label>
            <p className="text-sm text-muted-foreground">
              Edite o prompt diretamente ou use feedbacks para refinar
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={generatePrompt}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Regenerar
          </Button>
        </div>

        {isGenerating ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Gerando instruções do agente...</p>
          </div>
        ) : (
          <Textarea
            value={wizardData.generatedPrompt}
            onChange={(e) => updateField('generatedPrompt', e.target.value)}
            rows={14}
            className="font-mono text-sm"
            placeholder="O prompt do agente será gerado automaticamente..."
          />
        )}

        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            Edite o texto acima livremente ou use a aba "Feedback" para refinamentos via IA.
          </p>
        </div>
      </TabsContent>

      <TabsContent value="test" className="mt-4 space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Simule uma conversa com o agente. As mensagens NÃO são enviadas ao WhatsApp.
          </p>
        </div>
        
        <div className="border rounded-lg h-[300px] overflow-y-auto p-4 space-y-3 bg-muted/30">
          {testMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Digite uma mensagem para simular a conversa
            </div>
          ) : (
            testMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'max-w-[80%] p-3 rounded-lg',
                  msg.role === 'user' ? 'ml-auto bg-primary/10' : 'bg-card border'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {msg.role === 'agent' ? (
                    <Bot className="h-4 w-4 text-purple-500" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {msg.role === 'agent' ? 'Agente' : 'Você (cliente simulado)'}
                  </span>
                </div>
                <p className="text-sm">{msg.content}</p>
                {msg.role === 'agent' && (
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleTestFeedback(msg, false)}
                    >
                      <ThumbsDown className="h-3 w-3 mr-1" />
                      Feedback
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleTestFeedback(msg, true)}
                    >
                      <ThumbsUp className="h-3 w-3 mr-1" />
                      Boa
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
          {isSimulating && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Agente pensando...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="flex gap-2">
          <Input
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="Simular mensagem do cliente..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                simulateMessage();
              }
            }}
            disabled={isSimulating}
          />
          <Button onClick={simulateMessage} disabled={isSimulating || !testInput.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        
        {testMessages.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearTestConversation}>
            Limpar Conversa
          </Button>
        )}
      </TabsContent>

      <TabsContent value="feedback" className="mt-4 space-y-4">
        <div>
          <Label>Novo Feedback</Label>
          <p className="text-sm text-muted-foreground mb-2">
            Descreva o que você quer ajustar no comportamento do agente
          </p>
          <Textarea
            value={newFeedback}
            onChange={(e) => setNewFeedback(e.target.value)}
            rows={4}
            placeholder="Ex: Quando o cliente perguntar sobre preço, oferecer um desconto de 10% para fechar na primeira reunião..."
          />
        </div>

        <Button 
          onClick={applyFeedback} 
          disabled={isRefining || !newFeedback.trim()}
          className="w-full"
        >
          {isRefining ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Aplicar Feedback e Regenerar Prompt
        </Button>

        {feedbackHistory.length > 0 && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico de Feedbacks ({feedbackHistory.length})
            </Label>
            <ScrollArea className="h-[200px] rounded-md border p-3">
              <div className="space-y-3">
                {feedbackHistory.map((entry) => (
                  <div 
                    key={entry.id} 
                    className="p-3 bg-muted/50 rounded-lg group relative"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {format(new Date(entry.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </Badge>
                      {entry.applied && (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                          Aplicado
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                        onClick={() => removeFeedbackEntry(entry.id)}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                    <p className="text-sm">{entry.feedback}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </TabsContent>

      <TabsContent value="wizard" className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Input
              value={wizardData.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Segmento</Label>
            <Select
              value={wizardData.companySegment}
              onValueChange={(value) => updateField('companySegment', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEGMENTS.map((segment) => (
                  <SelectItem key={segment.value} value={segment.value}>
                    {segment.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Descrição da Empresa</Label>
          <Textarea
            value={wizardData.companyDescription}
            onChange={(e) => updateField('companyDescription', e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Produtos/Serviços</Label>
          <Textarea
            value={wizardData.products}
            onChange={(e) => updateField('products', e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Diferenciais</Label>
          <Textarea
            value={wizardData.differentials}
            onChange={(e) => updateField('differentials', e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            Após editar os dados, clique em "Regenerar" na aba Prompt para atualizar as instruções.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );

  // ==================== WIZARD STEPS ====================

  const renderWizardStep = () => {
    switch (currentStep) {
      case 1:
        // Canal e Objetivo
        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-base font-medium">Canal de Atendimento</Label>
              <RadioGroup
                value={wizardData.channel}
                onValueChange={(value) => updateField('channel', value as WizardData['channel'])}
                className="grid gap-2"
              >
                {CHANNELS.map((channel) => (
                  <div 
                    key={channel.value}
                    className={cn(
                      "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      wizardData.channel === channel.value && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem value={channel.value} id={channel.value} />
                    <div className="flex-1">
                      <Label htmlFor={channel.value} className="cursor-pointer font-medium">
                        {channel.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">{channel.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-medium">Objetivo Principal</Label>
              <RadioGroup
                value={wizardData.objective}
                onValueChange={(value) => updateField('objective', value as WizardData['objective'])}
                className="grid gap-2"
              >
                {OBJECTIVES.map((obj) => (
                  <div 
                    key={obj.value}
                    className={cn(
                      "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      wizardData.objective === obj.value && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem value={obj.value} id={`obj-${obj.value}`} />
                    <div className="flex-1">
                      <Label htmlFor={`obj-${obj.value}`} className="cursor-pointer font-medium">
                        {obj.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">{obj.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        );

      case 2:
        // Tom e Formato
        return (
          <div className="space-y-6">
            {/* Response Length Slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Tamanho das Respostas</Label>
                <Badge variant="outline">{getLengthLabel(wizardData.responseLength)}</Badge>
              </div>
              <div className="px-2">
                <Slider
                  value={[wizardData.responseLength]}
                  onValueChange={([value]) => updateField('responseLength', value)}
                  min={0}
                  max={100}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Curto</span>
                  <span>Médio</span>
                  <span>Detalhado</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {getLengthRules(wizardData.responseLength)}
              </p>
            </div>

            {/* Formality Toggle */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Tom de Comunicação</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={wizardData.formality === 'informal' ? 'default' : 'outline'}
                  className="flex-1 gap-2"
                  onClick={() => updateField('formality', 'informal')}
                >
                  <Smile className="h-4 w-4" />
                  Informal
                </Button>
                <Button
                  type="button"
                  variant={wizardData.formality === 'professional' ? 'default' : 'outline'}
                  className="flex-1 gap-2"
                  onClick={() => updateField('formality', 'professional')}
                >
                  <Briefcase className="h-4 w-4" />
                  Profissional
                </Button>
              </div>
            </div>

            {/* Emojis */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Usar Emojis?</Label>
              <div className="flex gap-2">
                {[
                  { value: 'yes', label: 'Sim 😊' },
                  { value: 'occasional', label: 'Às vezes' },
                  { value: 'no', label: 'Não' },
                ].map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={wizardData.emojis === opt.value ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => updateField('emojis', opt.value as WizardData['emojis'])}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Max Questions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Máximo de perguntas por mensagem</Label>
                <Badge variant="outline">{wizardData.maxQuestionsPerMessage}</Badge>
              </div>
              <div className="px-2">
                <Slider
                  value={[wizardData.maxQuestionsPerMessage]}
                  onValueChange={([value]) => updateField('maxQuestionsPerMessage', value)}
                  min={1}
                  max={3}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>1 pergunta</span>
                  <span>2 perguntas</span>
                  <span>3 perguntas</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Recomendamos 1 pergunta por mensagem para conversas mais naturais.
              </p>
            </div>
          </div>
        );

      case 3:
        // Escopo do Agente
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">O que o agente pode fazer?</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Selecione os assuntos que o agente pode abordar. Os não selecionados serão bloqueados.
              </p>
            </div>

            <div className="space-y-2">
              {SCOPE_OPTIONS.map((option) => (
                <div
                  key={option.key}
                  className={cn(
                    "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    wizardData.scope[option.key as keyof typeof wizardData.scope] && "border-primary bg-primary/5"
                  )}
                  onClick={() => updateScope(option.key as keyof typeof wizardData.scope, !wizardData.scope[option.key as keyof typeof wizardData.scope])}
                >
                  <Checkbox
                    checked={wizardData.scope[option.key as keyof typeof wizardData.scope]}
                    onCheckedChange={(checked) => updateScope(option.key as keyof typeof wizardData.scope, !!checked)}
                  />
                  <div className="flex-1">
                    <Label className="cursor-pointer font-medium">{option.label}</Label>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Preview of generated rules */}
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <p className="text-sm font-medium">Preview das regras geradas:</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-green-600 font-medium">✅ PODE:</p>
                  <ul className="text-muted-foreground text-xs space-y-1 mt-1">
                    {getScopeRules(wizardData.scope).can.slice(0, 3).map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                    {getScopeRules(wizardData.scope).can.length > 3 && (
                      <li>• +{getScopeRules(wizardData.scope).can.length - 3} mais...</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-red-600 font-medium">❌ NÃO PODE:</p>
                  <ul className="text-muted-foreground text-xs space-y-1 mt-1">
                    {getScopeRules(wizardData.scope).cannot.slice(0, 3).map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                    {getScopeRules(wizardData.scope).cannot.length > 3 && (
                      <li>• +{getScopeRules(wizardData.scope).cannot.length - 3} mais...</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        // RAG e Intents
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium">Intents que buscam na Base de Conhecimento</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Quando o cliente perguntar sobre esses assuntos, o agente buscará na base de conhecimento (RAG).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {RAG_INTENTS.map((intent) => (
                <div
                  key={intent.value}
                  className={cn(
                    "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    wizardData.ragIntents.includes(intent.value) && "border-primary bg-primary/5"
                  )}
                  onClick={() => toggleRagIntent(intent.value)}
                >
                  <Checkbox
                    checked={wizardData.ragIntents.includes(intent.value)}
                    onCheckedChange={() => toggleRagIntent(intent.value)}
                  />
                  <Label className="cursor-pointer font-medium text-sm">{intent.label}</Label>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <Label className="text-base font-medium">Quando não encontrar na base</Label>
              <p className="text-sm text-muted-foreground">
                O que o agente deve fazer se não encontrar a informação?
              </p>
              <RadioGroup
                value={wizardData.noRagBehavior}
                onValueChange={(value) => updateField('noRagBehavior', value as WizardData['noRagBehavior'])}
                className="space-y-2"
              >
                {NO_RAG_BEHAVIORS.map((behavior) => (
                  <div 
                    key={behavior.value}
                    className={cn(
                      "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      wizardData.noRagBehavior === behavior.value && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem value={behavior.value} id={`rag-${behavior.value}`} />
                    <div className="flex-1">
                      <Label htmlFor={`rag-${behavior.value}`} className="cursor-pointer font-medium">
                        {behavior.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">{behavior.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        );

      case 5:
        // Fallbacks
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium">Mensagens de Fallback</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Mensagens padrão para situações especiais. Personalize como preferir.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  Quando não encontrar na base de conhecimento
                </Label>
                <Textarea
                  value={wizardData.fallbacks.noRag}
                  onChange={(e) => updateFallback('noRag', e.target.value)}
                  rows={2}
                  placeholder="Não encontrei essa informação..."
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageCircleWarning className="h-4 w-4 text-orange-500" />
                  Quando o assunto está fora do escopo
                </Label>
                <Textarea
                  value={wizardData.fallbacks.outOfScope}
                  onChange={(e) => updateFallback('outOfScope', e.target.value)}
                  rows={2}
                  placeholder="Eu só posso te ajudar com..."
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="h-4 w-4 text-green-500" />
                  Quando transferir para atendimento humano
                </Label>
                <Textarea
                  value={wizardData.fallbacks.handoff}
                  onChange={(e) => updateFallback('handoff', e.target.value)}
                  rows={2}
                  placeholder="Vou pedir para um consultor entrar em contato..."
                />
              </div>
            </div>

            {/* Company info for prompt generation */}
            <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
              <Label className="text-base font-medium">Informações da Empresa (opcional)</Label>
              <p className="text-sm text-muted-foreground">
                Preencha para gerar um prompt mais personalizado
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input
                    value={wizardData.companyName}
                    onChange={(e) => updateField('companyName', e.target.value)}
                    placeholder="Ex: TechCorp"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Segmento</Label>
                  <Select
                    value={wizardData.companySegment}
                    onValueChange={(value) => updateField('companySegment', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEGMENTS.map((segment) => (
                        <SelectItem key={segment.value} value={segment.value}>
                          {segment.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Produtos/Serviços</Label>
                <Textarea
                  value={wizardData.products}
                  onChange={(e) => updateField('products', e.target.value)}
                  rows={2}
                  placeholder="Liste seus principais produtos ou serviços..."
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ==================== RENDER ====================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isEditMode ? 'Editar Agente SDR' : 'Configurar Agente SDR'}
          </DialogTitle>
        </DialogHeader>

        {/* Agent Name Field */}
        <div className="space-y-2 pb-4 border-b">
          <Label htmlFor="agent-name">Nome do Agente</Label>
          <Input
            id="agent-name"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder={`Agente ${wizardData.companyName || 'SDR'}`}
          />
          <p className="text-xs text-muted-foreground">
            Deixe vazio para usar o nome padrão baseado na empresa
          </p>
        </div>

        {isEditMode ? (
          // Edit mode: show tabs
          <>
            {renderEditMode()}

            <div className="flex justify-end pt-4 border-t mt-4">
              <Button
                onClick={handleSave}
                disabled={!wizardData.generatedPrompt.trim() || isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Salvar Alterações
              </Button>
            </div>
          </>
        ) : (
          // Wizard mode: show steps
          <>
            {/* Progress indicator */}
            <div className="space-y-3">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between">
                {STEPS.map((step) => {
                  const Icon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;
                  
                  return (
                    <div 
                      key={step.id} 
                      className={cn(
                        "flex items-center gap-1 text-xs",
                        isActive && "text-primary font-medium",
                        isCompleted && "text-muted-foreground",
                        !isActive && !isCompleted && "text-muted-foreground/50"
                      )}
                    >
                      <div className={cn(
                        "p-1 rounded-full",
                        isActive && "bg-primary/10",
                        isCompleted && "bg-green-500/10"
                      )}>
                        {isCompleted ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Icon className={cn(
                            "h-3 w-3",
                            isActive && "text-primary"
                          )} />
                        )}
                      </div>
                      <span className="hidden md:inline">{step.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step content */}
            <div className="py-4 space-y-4 min-h-[350px]">
              {renderWizardStep()}
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>

              {currentStep < 5 ? (
                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                >
                  Próximo
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleSave}
                  disabled={!canProceed() || isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Salvar Agente
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
