import { useState, useEffect } from 'react';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Trash2, Book, HelpCircle, Package, FileText, Settings2, Search, BrainCircuit, Loader2, Wand2, Upload, FileType, RefreshCw, MessageSquare } from 'lucide-react';
import { ImportKnowledge } from './ImportKnowledge';
import { KnowledgeWizardChat } from './KnowledgeWizardChat';
import { ManualKnowledgeDialog } from './ManualKnowledgeDialog';

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
  wizard: { label: 'Wizard IA', icon: Wand2 },
  wizard_chat: { label: 'Chat IA', icon: MessageSquare },
  manual: { label: 'Manual', icon: FileText },
  import_txt: { label: 'TXT', icon: FileType },
  import_md: { label: 'Markdown', icon: FileType },
  import_pdf: { label: 'PDF', icon: FileType },
  import_docx: { label: 'DOCX', icon: FileType },
  import_url: { label: 'URL', icon: Search },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-muted text-muted-foreground' },
  processing: { label: 'Processando', color: 'bg-primary/10 text-primary' },
  published: { label: 'Publicado', color: 'bg-secondary text-secondary-foreground' },
  archived: { label: 'Arquivado', color: 'bg-muted text-muted-foreground' },
  error: { label: 'Erro', color: 'bg-destructive/10 text-destructive' },
};


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
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
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

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSelectedAgentId('');
    }
  };

  const handleWizardComplete = async (documents: Array<{ title: string; content: string; type: string }>) => {
    if (!organization?.id) return;

    setSaving(true);
    try {
      let savedCount = 0;
      
      for (const doc of documents) {
        // Create knowledge_item for each document
        const { data: item, error: itemError } = await supabase
          .from('knowledge_items')
          .insert({
            organization_id: organization.id,
            agent_id: selectedAgentId || null,
            title: doc.title || 'Conhecimento sem título',
            type: doc.type || 'general',
            status: 'processing',
            source: 'wizard_chat',
          })
          .select()
          .single();

        if (itemError) {
          console.error('Error saving document:', doc.title, itemError);
          continue;
        }

        // Process the content
        const { error: processError } = await supabase.functions.invoke('process-knowledge', {
          body: {
            itemId: item.id,
            content: doc.content,
          },
        });

        if (processError) {
          console.error('Error processing document:', doc.title, processError);
        } else {
          savedCount++;
        }
      }

      if (savedCount > 0) {
        toast.success(`${savedCount} conhecimento(s) adicionado(s) com sucesso`);
      } else {
        toast.error('Erro ao salvar conhecimentos');
      }
      
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

            <div className="flex gap-2">
              <ManualKnowledgeDialog agents={agents} onSuccess={fetchData} />

              <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
                <DialogTrigger asChild>
                  <Button>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Criar com IA
                  </Button>
                </DialogTrigger>
                <DialogContent size="lg" className="p-0 overflow-hidden">
                  <KnowledgeWizardChat
                    agentId={selectedAgentId || null}
                    onComplete={handleWizardComplete}
                    onCancel={() => handleDialogClose(false)}
                  />
                </DialogContent>
              </Dialog>
            </div>
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
