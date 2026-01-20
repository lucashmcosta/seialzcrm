import { useState, useEffect } from 'react';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Trash2, Book, HelpCircle, Package, FileText, Settings2, Search, BrainCircuit, Loader2, Sparkles, ArrowLeft, ArrowRight, Check, Wand2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface KnowledgeItem {
  id: string;
  content: string;
  content_type: string;
  title: string | null;
  metadata: Record<string, any>;
  agent_id: string | null;
  created_at: string;
}

interface AIAgent {
  id: string;
  name: string;
}

const contentTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string; description: string }> = {
  faq: { 
    label: 'FAQ', 
    icon: HelpCircle, 
    color: 'bg-blue-500/10 text-blue-500',
    description: 'Perguntas frequentes e suas respostas',
  },
  product: { 
    label: 'Produto', 
    icon: Package, 
    color: 'bg-green-500/10 text-green-500',
    description: 'Informações sobre produtos ou serviços',
  },
  instruction: { 
    label: 'Instrução', 
    icon: Settings2, 
    color: 'bg-purple-500/10 text-purple-500',
    description: 'Instruções e procedimentos a seguir',
  },
  policy: { 
    label: 'Política', 
    icon: FileText, 
    color: 'bg-orange-500/10 text-orange-500',
    description: 'Regras, políticas e diretrizes',
  },
  general: { 
    label: 'Geral', 
    icon: Book, 
    color: 'bg-muted text-muted-foreground',
    description: 'Conhecimento geral da empresa',
  },
};

type WizardStep = 'initial' | 'questions' | 'review';

export function KnowledgeBaseSettings() {
  const { organization } = useOrganizationContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState<string>('faq');
  const [formAgentId, setFormAgentId] = useState<string>('');

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>('initial');
  const [initialDescription, setInitialDescription] = useState('');
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [enhancing, setEnhancing] = useState(false);
  const [typeLabel, setTypeLabel] = useState('');

  const fetchData = async () => {
    if (!organization?.id) return;

    setLoading(true);
    try {
      const [knowledgeResult, agentsResult] = await Promise.all([
        supabase
          .from('knowledge_embeddings')
          .select('id, content, content_type, title, metadata, agent_id, created_at')
          .eq('organization_id', organization.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('ai_agents')
          .select('id, name')
          .eq('organization_id', organization.id),
      ]);

      if (knowledgeResult.error) throw knowledgeResult.error;
      if (agentsResult.error) throw agentsResult.error;

      setItems((knowledgeResult.data as KnowledgeItem[]) || []);
      setAgents(agentsResult.data || []);
    } catch (error) {
      console.error('Error fetching knowledge:', error);
      toast.error('Erro ao carregar base de conhecimento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [organization?.id]);

  const resetWizard = () => {
    setWizardStep('initial');
    setInitialDescription('');
    setAiQuestions([]);
    setUserAnswers([]);
    setFormTitle('');
    setFormContent('');
    setFormType('faq');
    setFormAgentId('');
    setTypeLabel('');
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      resetWizard();
    }
  };

  const handleStartEnhance = async () => {
    setEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-knowledge', {
        body: {
          action: 'get_questions',
          contentType: formType,
        },
      });

      if (error) throw error;

      setAiQuestions(data.questions || []);
      setUserAnswers(new Array(data.questions?.length || 0).fill(''));
      setTypeLabel(data.typeLabel || '');
      setWizardStep('questions');
    } catch (error) {
      console.error('Error getting questions:', error);
      toast.error('Erro ao carregar perguntas. Tente novamente.');
    } finally {
      setEnhancing(false);
    }
  };

  const handleGenerateContent = async () => {
    setEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-knowledge', {
        body: {
          action: 'generate_content',
          contentType: formType,
          initialDescription,
          answers: userAnswers,
        },
      });

      if (error) throw error;

      setFormTitle(data.title || '');
      setFormContent(data.content || '');
      setWizardStep('review');
    } catch (error) {
      console.error('Error generating content:', error);
      toast.error('Erro ao gerar conteúdo. Tente novamente.');
    } finally {
      setEnhancing(false);
    }
  };

  const handleSubmit = async () => {
    if (!organization?.id || !formContent.trim()) {
      toast.error('Preencha o conteúdo');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('generate-embedding', {
        body: {
          organizationId: organization.id,
          agentId: formAgentId || null,
          content: formContent,
          contentType: formType,
          title: formTitle || null,
          metadata: {},
        },
      });

      if (error) throw error;

      toast.success('Conhecimento adicionado com sucesso');
      handleDialogClose(false);
      fetchData();
    } catch (error) {
      console.error('Error saving knowledge:', error);
      toast.error('Erro ao salvar conhecimento');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('knowledge_embeddings')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setItems(items.filter(item => item.id !== id));
      toast.success('Conhecimento removido');
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Erro ao remover conhecimento');
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesType = filterType === 'all' || item.content_type === filterType;
    const matchesAgent = filterAgent === 'all' || 
      (filterAgent === 'global' ? item.agent_id === null : item.agent_id === filterAgent);
    return matchesSearch && matchesType && matchesAgent;
  });

  const updateAnswer = (index: number, value: string) => {
    const newAnswers = [...userAnswers];
    newAnswers[index] = value;
    setUserAnswers(newAnswers);
  };

  const getWizardProgress = () => {
    switch (wizardStep) {
      case 'initial': return 33;
      case 'questions': return 66;
      case 'review': return 100;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const renderWizardContent = () => {
    switch (wizardStep) {
      case 'initial':
        return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Adicionar Conhecimento
              </DialogTitle>
              <DialogDescription>
                Escolha o tipo e descreva brevemente. A IA vai te guiar com perguntas específicas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Tipo de Conteúdo</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Object.entries(contentTypeConfig).map(([key, config]) => {
                    const Icon = config.icon;
                    const isSelected = formType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormType(key)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                          isSelected 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className={`p-2 rounded-full ${config.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-medium">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {contentTypeConfig[formType]?.description}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent">Agente (opcional)</Label>
                <Select value={formAgentId || 'global'} onValueChange={(val) => setFormAgentId(val === 'global' ? '' : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Global - todos os agentes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global - todos os agentes</SelectItem>
                    {agents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição inicial (opcional)</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva brevemente o que você quer adicionar..."
                  value={initialDescription}
                  onChange={(e) => setInitialDescription(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Uma breve descrição ajuda a IA a fazer perguntas mais relevantes.
                </p>
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => handleDialogClose(false)}>
                Cancelar
              </Button>
              <Button onClick={handleStartEnhance} disabled={enhancing}>
                {enhancing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Criar com Assistente IA
              </Button>
            </DialogFooter>
          </>
        );

      case 'questions':
        return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                Perguntas sobre {typeLabel}
              </DialogTitle>
              <DialogDescription>
                Responda as perguntas abaixo para criar um conteúdo completo e otimizado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[400px] overflow-y-auto">
              {aiQuestions.map((question, index) => (
                <div key={index} className="space-y-2">
                  <Label className="text-sm font-medium">
                    {index + 1}. {question}
                  </Label>
                  <Textarea
                    placeholder="Sua resposta..."
                    value={userAnswers[index] || ''}
                    onChange={(e) => updateAnswer(index, e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>
              ))}
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setWizardStep('initial')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={handleGenerateContent} disabled={enhancing}>
                {enhancing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Gerar Conteúdo
              </Button>
            </DialogFooter>
          </>
        );

      case 'review':
        return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                Revisar e Salvar
              </DialogTitle>
              <DialogDescription>
                Revise o conteúdo gerado. Você pode editar antes de salvar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  placeholder="Título do conhecimento"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Conteúdo</Label>
                <Textarea
                  id="content"
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary" className={contentTypeConfig[formType]?.color}>
                  {contentTypeConfig[formType]?.label}
                </Badge>
                {formAgentId && (
                  <Badge variant="outline">
                    {agents.find(a => a.id === formAgentId)?.name || 'Agente'}
                  </Badge>
                )}
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setWizardStep('questions')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={handleSubmit} disabled={saving || !formContent.trim()}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Salvar Conhecimento
              </Button>
            </DialogFooter>
          </>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with RAG explanation */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Base de Conhecimento (RAG)</CardTitle>
          </div>
          <CardDescription>
            Adicione informações que seus agentes de IA podem usar para responder com mais precisão. 
            O sistema busca automaticamente o conhecimento mais relevante para cada mensagem recebida.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Filters and Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(contentTypeConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAgent} onValueChange={setFilterAgent}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Agente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="global">Global</SelectItem>
              {agents.map(agent => (
                <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Conhecimento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            {/* Progress indicator */}
            <div className="mb-2">
              <Progress value={getWizardProgress()} className="h-1" />
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span className={wizardStep === 'initial' ? 'text-primary font-medium' : ''}>Tipo</span>
                <span className={wizardStep === 'questions' ? 'text-primary font-medium' : ''}>Perguntas</span>
                <span className={wizardStep === 'review' ? 'text-primary font-medium' : ''}>Revisar</span>
              </div>
            </div>
            {renderWizardContent()}
          </DialogContent>
        </Dialog>
      </div>

      {/* Knowledge Items Grid */}
      {filteredItems.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <Book className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">Nenhum conhecimento encontrado</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {items.length === 0 
                ? 'Adicione informações para que seus agentes respondam com mais precisão.'
                : 'Nenhum resultado para os filtros selecionados.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => {
            const typeConfig = contentTypeConfig[item.content_type] || contentTypeConfig.general;
            const TypeIcon = typeConfig.icon;
            const agent = agents.find(a => a.id === item.agent_id);

            return (
              <Card key={item.id} className="group relative">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={typeConfig.color}>
                        <TypeIcon className="mr-1 h-3 w-3" />
                        {typeConfig.label}
                      </Badge>
                      {agent && (
                        <Badge variant="outline" className="text-xs">
                          {agent.name}
                        </Badge>
                      )}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover conhecimento?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O agente não poderá mais usar esta informação.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(item.id)}>
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  {item.title && (
                    <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-4">
                    {item.content}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
