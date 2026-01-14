import { useState, useEffect } from 'react';
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
import { Loader2, RefreshCw, ArrowLeft, ArrowRight, Check, Sparkles, Building2, Package, Target, FileText, MessageSquarePlus, History, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface WizardData {
  companyName: string;
  companySegment: string;
  companyDescription: string;
  products: string;
  differentials: string;
  goal: 'qualify_lead' | 'schedule_meeting' | 'answer_questions' | 'support';
  tone: 'professional' | 'friendly' | 'technical';
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

interface SDRAgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingAgent: {
    id: string;
    name: string;
    custom_instructions: string | null;
    wizard_data: any;
    feedback_history?: FeedbackEntry[];
  } | null;
  organizationId: string;
  onSuccess: () => void;
}

const STEPS = [
  { id: 1, title: 'Sobre a Empresa', icon: Building2 },
  { id: 2, title: 'Produtos e Serviços', icon: Package },
  { id: 3, title: 'Estratégia de Vendas', icon: Target },
  { id: 4, title: 'Revisão e Prompt', icon: FileText },
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

const GOALS = [
  { value: 'qualify_lead', label: 'Qualificar leads', description: 'Entender necessidades e perfil do cliente' },
  { value: 'schedule_meeting', label: 'Agendar reuniões', description: 'Converter interesse em demonstrações agendadas' },
  { value: 'answer_questions', label: 'Responder dúvidas', description: 'Tirar dúvidas sobre produtos e serviços' },
  { value: 'support', label: 'Suporte ao cliente', description: 'Ajudar clientes existentes com problemas' },
];

const TONES = [
  { value: 'professional', label: 'Profissional', description: 'Formal e objetivo' },
  { value: 'friendly', label: 'Amigável', description: 'Descontraído e acessível' },
  { value: 'technical', label: 'Técnico', description: 'Detalhado e preciso' },
];

const initialWizardData: WizardData = {
  companyName: '',
  companySegment: 'saas',
  companyDescription: '',
  products: '',
  differentials: '',
  goal: 'schedule_meeting',
  tone: 'friendly',
  salesPitch: '',
  restrictions: '',
  generatedPrompt: '',
};

export function SDRAgentWizard({ 
  open, 
  onOpenChange, 
  existingAgent, 
  organizationId, 
  onSuccess 
}: SDRAgentWizardProps) {
  const isEditMode = !!(existingAgent?.id && existingAgent?.custom_instructions);
  
  const [currentStep, setCurrentStep] = useState(isEditMode ? 4 : 1);
  const [activeTab, setActiveTab] = useState<'prompt' | 'feedback' | 'wizard'>('prompt');
  const [wizardData, setWizardData] = useState<WizardData>(() => {
    if (existingAgent?.wizard_data) {
      return {
        ...existingAgent.wizard_data,
        generatedPrompt: existingAgent.custom_instructions || existingAgent.wizard_data.generatedPrompt || '',
      };
    }
    return initialWizardData;
  });
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackEntry[]>(
    existingAgent?.feedback_history || []
  );
  const [newFeedback, setNewFeedback] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when dialog opens/closes or agent changes
  useEffect(() => {
    if (open) {
      const isEdit = !!(existingAgent?.id && existingAgent?.custom_instructions);
      setCurrentStep(isEdit ? 4 : 1);
      setActiveTab('prompt');
      setNewFeedback('');
      
      if (existingAgent?.wizard_data) {
        setWizardData({
          ...existingAgent.wizard_data,
          generatedPrompt: existingAgent.custom_instructions || existingAgent.wizard_data.generatedPrompt || '',
        });
      } else {
        setWizardData(initialWizardData);
      }
      
      setFeedbackHistory(existingAgent?.feedback_history || []);
    }
  }, [open, existingAgent]);

  const updateField = <K extends keyof WizardData>(field: K, value: WizardData[K]) => {
    setWizardData(prev => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return wizardData.companyName.trim() && wizardData.companyDescription.trim();
      case 2:
        return wizardData.products.trim();
      case 3:
        return true;
      case 4:
        return wizardData.generatedPrompt.trim();
      default:
        return false;
    }
  };

  const generatePrompt = async () => {
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
            goal: GOALS.find(g => g.value === wizardData.goal)?.label || wizardData.goal,
            tone: TONES.find(t => t.value === wizardData.tone)?.label || wizardData.tone,
            salesPitch: wizardData.salesPitch,
            restrictions: wizardData.restrictions,
          },
        },
      });

      if (error) throw error;

      if (data?.content) {
        updateField('generatedPrompt', data.content);
      }
    } catch (error: any) {
      console.error('Error generating prompt:', error);
      toast.error(error.message || 'Erro ao gerar prompt. Verifique se você tem uma integração de IA configurada.');
    } finally {
      setIsGenerating(false);
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
        
        // Add to feedback history
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

  const handleNext = async () => {
    if (currentStep === 3) {
      setCurrentStep(4);
      if (!wizardData.generatedPrompt) {
        await generatePrompt();
      }
    } else if (currentStep < 4) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSave = async () => {
    if (!wizardData.generatedPrompt.trim()) {
      toast.error('O prompt do agente não pode estar vazio');
      return;
    }

    setIsSaving(true);
    try {
      const agentData = {
        organization_id: organizationId,
        name: `Agente ${wizardData.companyName}`,
        custom_instructions: wizardData.generatedPrompt,
        wizard_data: JSON.parse(JSON.stringify(wizardData)),
        feedback_history: JSON.parse(JSON.stringify(feedbackHistory)),
        is_enabled: true,
        goal: wizardData.goal === 'qualify_lead' ? 'Qualificar leads e entender necessidades' :
              wizardData.goal === 'schedule_meeting' ? 'Agendar demonstrações e reuniões' :
              wizardData.goal === 'answer_questions' ? 'Responder dúvidas sobre produtos' :
              'Suporte ao cliente',
        tone: wizardData.tone,
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
        toast.success('Agente SDR criado e ativado com sucesso!');
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

  const progress = (currentStep / 4) * 100;

  // Render edit mode (with tabs)
  const renderEditMode = () => (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1">
      <TabsList className="w-full grid grid-cols-3">
        <TabsTrigger value="prompt" className="gap-2">
          <FileText className="h-4 w-4" />
          Prompt Atual
        </TabsTrigger>
        <TabsTrigger value="feedback" className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          Adicionar Feedback
        </TabsTrigger>
        <TabsTrigger value="wizard" className="gap-2">
          <History className="h-4 w-4" />
          Dados Originais
        </TabsTrigger>
      </TabsList>

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
            Edite o texto acima livremente ou use a aba "Adicionar Feedback" para refinamentos via IA.
          </p>
        </div>
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Objetivo</Label>
            <Select
              value={wizardData.goal}
              onValueChange={(value) => updateField('goal', value as WizardData['goal'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOALS.map((goal) => (
                  <SelectItem key={goal.value} value={goal.value}>
                    {goal.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tom</Label>
            <Select
              value={wizardData.tone}
              onValueChange={(value) => updateField('tone', value as WizardData['tone'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((tone) => (
                  <SelectItem key={tone.value} value={tone.value}>
                    {tone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            Ao alterar os dados acima, clique em "Regenerar" na aba "Prompt Atual" para gerar um novo prompt.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );

  // Render wizard step content (new agent creation)
  const renderWizardStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Nome da Empresa *</Label>
              <Input
                id="companyName"
                placeholder="Ex: TechCorp Solutions"
                value={wizardData.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="companySegment">Segmento de Atuação</Label>
              <Select
                value={wizardData.companySegment}
                onValueChange={(value) => updateField('companySegment', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o segmento" />
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

            <div className="space-y-2">
              <Label htmlFor="companyDescription">Descreva sua empresa em poucas palavras *</Label>
              <Textarea
                id="companyDescription"
                placeholder="Ex: Somos uma empresa de software que desenvolve soluções de CRM e ERP para pequenas e médias empresas..."
                value={wizardData.companyDescription}
                onChange={(e) => updateField('companyDescription', e.target.value)}
                rows={4}
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="products">Produtos e Serviços *</Label>
              <p className="text-sm text-muted-foreground">
                Liste seus principais produtos ou serviços (um por linha)
              </p>
              <Textarea
                id="products"
                placeholder="CRM Pro - Sistema completo de gestão de relacionamento&#10;ERP Suite - Gestão empresarial integrada&#10;Módulo Analytics - Dashboard de métricas de vendas"
                value={wizardData.products}
                onChange={(e) => updateField('products', e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="differentials">Diferenciais Competitivos</Label>
              <p className="text-sm text-muted-foreground">
                O que torna sua empresa especial?
              </p>
              <Textarea
                id="differentials"
                placeholder="Interface intuitiva, suporte 24h, integração com WhatsApp, preço acessível para PMEs..."
                value={wizardData.differentials}
                onChange={(e) => updateField('differentials', e.target.value)}
                rows={3}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label>Objetivo Principal do Agente</Label>
              <RadioGroup
                value={wizardData.goal}
                onValueChange={(value) => updateField('goal', value as WizardData['goal'])}
                className="grid gap-2"
              >
                {GOALS.map((goal) => (
                  <div 
                    key={goal.value}
                    className={cn(
                      "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      wizardData.goal === goal.value && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem value={goal.value} id={goal.value} />
                    <div className="flex-1">
                      <Label htmlFor={goal.value} className="cursor-pointer font-medium">
                        {goal.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">{goal.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label>Tom de Comunicação</Label>
              <RadioGroup
                value={wizardData.tone}
                onValueChange={(value) => updateField('tone', value as WizardData['tone'])}
                className="flex gap-2"
              >
                {TONES.map((tone) => (
                  <div 
                    key={tone.value}
                    className={cn(
                      "flex-1 flex items-center space-x-2 p-3 rounded-lg border cursor-pointer transition-colors",
                      wizardData.tone === tone.value && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem value={tone.value} id={tone.value} />
                    <div>
                      <Label htmlFor={tone.value} className="cursor-pointer text-sm font-medium">
                        {tone.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{tone.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="salesPitch">Principais Argumentos de Venda (Pitch)</Label>
              <Textarea
                id="salesPitch"
                placeholder="- Oferecemos 14 dias de teste grátis&#10;- Implementação em menos de 1 semana&#10;- ROI comprovado: clientes aumentam vendas em 30%"
                value={wizardData.salesPitch}
                onChange={(e) => updateField('salesPitch', e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="restrictions">O que o agente NÃO deve fazer/falar?</Label>
              <Textarea
                id="restrictions"
                placeholder="- Nunca mencionar preços (direcionar para reunião)&#10;- Não fazer promessas de prazos&#10;- Não falar sobre concorrentes"
                value={wizardData.restrictions}
                onChange={(e) => updateField('restrictions', e.target.value)}
                rows={3}
              />
            </div>
          </div>
        );

      case 4:
        // In wizard mode step 4, show simple prompt view
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Instruções do Agente</Label>
                <p className="text-sm text-muted-foreground">
                  Revise e edite o prompt gerado pela IA
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
                rows={16}
                className="font-mono text-sm"
                placeholder="O prompt do agente será gerado automaticamente..."
              />
            )}

            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm text-muted-foreground">
                Edite o texto acima livremente até ficar do seu agrado. O agente usará estas instruções para responder aos clientes.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isEditMode ? 'Editar Agente SDR' : 'Configurar Agente SDR'}
          </DialogTitle>
        </DialogHeader>

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
                        "flex items-center gap-2 text-sm",
                        isActive && "text-primary font-medium",
                        isCompleted && "text-muted-foreground",
                        !isActive && !isCompleted && "text-muted-foreground/50"
                      )}
                    >
                      <div className={cn(
                        "p-1.5 rounded-full",
                        isActive && "bg-primary/10",
                        isCompleted && "bg-green-500/10"
                      )}>
                        {isCompleted ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Icon className={cn(
                            "h-3.5 w-3.5",
                            isActive && "text-primary"
                          )} />
                        )}
                      </div>
                      <span className="hidden sm:inline">{step.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step content */}
            <div className="py-4 space-y-4 min-h-[300px]">
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

              {currentStep < 4 ? (
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
                  Salvar e Ativar
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}