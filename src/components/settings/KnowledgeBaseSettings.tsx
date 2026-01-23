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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Trash2, Book, HelpCircle, Package, FileText, Settings2, Search, BrainCircuit, Loader2, Sparkles, ArrowLeft, Check, Wand2, Upload, Globe, FileType, RefreshCw } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ImportKnowledge } from './ImportKnowledge';

interface KnowledgeItem {
  id: string;
  title: string;
  type: string;
  status: string;
  source: string;
  source_url: string | null;
  metadata: Record<string, any>;
  agent_id: string | null;
  error_message: string | null;
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
    color: 'bg-primary/10 text-primary',
    description: 'Perguntas frequentes e suas respostas',
  },
  product: { 
    label: 'Produto', 
    icon: Package, 
    color: 'bg-secondary text-secondary-foreground',
    description: 'Informações sobre produtos ou serviços',
  },
  instruction: { 
    label: 'Instrução', 
    icon: Settings2, 
    color: 'bg-accent text-accent-foreground',
    description: 'Instruções e procedimentos a seguir',
  },
  policy: { 
    label: 'Política', 
    icon: FileText, 
    color: 'bg-warning/10 text-warning',
    description: 'Regras, políticas e diretrizes',
  },
  process: { 
    label: 'Processo', 
    icon: Settings2, 
    color: 'bg-muted text-muted-foreground',
    description: 'Processos e fluxos de trabalho',
  },
  objection: { 
    label: 'Objeção', 
    icon: HelpCircle, 
    color: 'bg-destructive/10 text-destructive',
    description: 'Respostas a objeções comuns',
  },
  general: { 
    label: 'Geral', 
    icon: Book, 
    color: 'bg-muted text-muted-foreground',
    description: 'Conhecimento geral da empresa',
  },
};

const sourceLabels: Record<string, { label: string; icon: React.ElementType }> = {
  wizard: { label: 'Wizard IA', icon: Sparkles },
  manual: { label: 'Manual', icon: FileText },
  import_txt: { label: 'TXT', icon: FileType },
  import_md: { label: 'Markdown', icon: FileType },
  import_pdf: { label: 'PDF', icon: FileType },
  import_docx: { label: 'DOCX', icon: FileType },
  import_url: { label: 'URL', icon: Globe },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-muted text-muted-foreground' },
  processing: { label: 'Processando', color: 'bg-primary/10 text-primary' },
  published: { label: 'Publicado', color: 'bg-secondary text-secondary-foreground' },
  archived: { label: 'Arquivado', color: 'bg-muted text-muted-foreground' },
  error: { label: 'Erro', color: 'bg-destructive/10 text-destructive' },
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
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('knowledge');

  // Form state for wizard
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
          .from('knowledge_items')
          .select('id, title, type, status, source, source_url, metadata, agent_id, error_message, created_at')
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
      // Create knowledge_item first
      const { data: item, error: itemError } = await supabase
        .from('knowledge_items')
        .insert({
          organization_id: organization.id,
          agent_id: formAgentId || null,
          title: formTitle || 'Conhecimento sem título',
          type: formType,
          status: 'processing',
          source: 'wizard',
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // Process the content
      const { error: processError } = await supabase.functions.invoke('process-knowledge', {
        body: {
          itemId: item.id,
          content: formContent,
        },
      });

      if (processError) throw processError;

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
        .from('knowledge_items')
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
      item.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || item.type === filterType;
    const matchesAgent = filterAgent === 'all' || 
      (filterAgent === 'global' ? item.agent_id === null : item.agent_id === filterAgent);
    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
    return matchesSearch && matchesType && matchesAgent && matchesStatus;
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
                Criar com Assistente IA
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
                Continuar
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
                <Check className="h-5 w-5 text-primary" />
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

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="knowledge" className="flex items-center gap-2">
            <Book className="h-4 w-4" />
            Conhecimentos ({items.length})
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Importar
          </TabsTrigger>
        </TabsList>

        {/* Knowledge List Tab */}
        <TabsContent value="knowledge" className="space-y-4 mt-4">
          {/* Filters and Actions */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo</SelectItem>
                  {Object.entries(contentTypeConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Status</SelectItem>
                  {Object.entries(statusConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Criar com IA
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
                {items.length === 0 && (
                  <div className="mt-4 flex gap-2 justify-center">
                    <Button onClick={() => setDialogOpen(true)}>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Criar com IA
                    </Button>
                    <Button variant="outline" onClick={() => setActiveTab('import')}>
                      <Upload className="mr-2 h-4 w-4" />
                      Importar Arquivo
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => {
                const typeConfig = contentTypeConfig[item.type] || contentTypeConfig.general;
                const TypeIcon = typeConfig.icon;
                const agent = agents.find(a => a.id === item.agent_id);
                const source = sourceLabels[item.source] || sourceLabels.manual;
                const SourceIcon = source.icon;
                const status = statusConfig[item.status] || statusConfig.draft;

                return (
                  <Card key={item.id} className="group relative">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className={typeConfig.color}>
                            <TypeIcon className="mr-1 h-3 w-3" />
                            {typeConfig.label}
                          </Badge>
                          <Badge variant="outline" className={status.color}>
                            {item.status === 'processing' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {status.label}
                          </Badge>
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
                      <CardTitle className="text-sm font-medium line-clamp-2">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <SourceIcon className="h-3 w-3" />
                        <span>{source.label}</span>
                        {agent && (
                          <>
                            <span>•</span>
                            <span>{agent.name}</span>
                          </>
                        )}
                        {item.metadata?.chunk_count && (
                          <>
                            <span>•</span>
                            <span>{item.metadata.chunk_count} chunks</span>
                          </>
                        )}
                      </div>
                      {item.status === 'error' && item.error_message && (
                        <p className="mt-2 text-xs text-destructive line-clamp-2">
                          {item.error_message}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Import Tab */}
        <TabsContent value="import" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Importar Conhecimento</CardTitle>
              <CardDescription>
                Importe arquivos de texto ou conteúdo de páginas web para a base de conhecimento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportKnowledge 
                agents={agents} 
                onSuccess={() => {
                  fetchData();
                  setActiveTab('knowledge');
                }} 
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
