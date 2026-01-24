import { useState, useEffect, useMemo } from 'react';
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
import { Trash2, Book, HelpCircle, Package, FileText, Settings2, Search, BrainCircuit, Loader2, Wand2, Upload, FileType, RefreshCw, MessageSquare, Globe, Sparkles } from 'lucide-react';
import { ImportKnowledge } from './ImportKnowledge';
import { KnowledgeWizardChat } from './KnowledgeWizardChat';
import { ManualKnowledgeDialog } from './ManualKnowledgeDialog';
import { KnowledgeWizard } from './KnowledgeWizard';

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
  // Multi-product fields
  category: string | null;
  scope: string | null;
  product_id: string | null;
  is_active: boolean | null;
  version: number | null;
  inherits_global: boolean | null;
}

interface AIAgent {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  slug: string;
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

import { CATEGORY_LABELS as categoryLabels, getCategoryLabel } from '@/lib/knowledge-categories';

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
  const [products, setProducts] = useState<Product[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('knowledge');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

  const fetchData = async () => {
    if (!organization?.id) return;

    setLoading(true);
    try {
      const [knowledgeResult, agentsResult, productsResult] = await Promise.all([
        supabase
          .from('knowledge_items')
          .select('id, title, type, status, source, source_url, metadata, agent_id, error_message, created_at, category, scope, product_id, is_active, version, inherits_global')
          .eq('organization_id', organization.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('ai_agents')
          .select('id, name')
          .eq('organization_id', organization.id),
        supabase
          .from('products')
          .select('id, name, slug')
          .eq('organization_id', organization.id)
          .eq('is_active', true)
          .order('display_order'),
      ]);

      if (knowledgeResult.error) throw knowledgeResult.error;
      if (agentsResult.error) throw agentsResult.error;
      if (productsResult.error) console.error('Products fetch error:', productsResult.error);

      setItems((knowledgeResult.data as KnowledgeItem[]) || []);
      setAgents(agentsResult.data || []);
      setProducts(productsResult.data || []);
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
        const { data: item, error: itemError } = await supabase
          .from('knowledge_items')
          .insert({
            organization_id: organization.id,
            agent_id: selectedAgentId || null,
            title: doc.title || 'Conhecimento sem título',
            type: doc.type || 'general',
            status: 'processing',
            source: 'wizard_chat',
            metadata: {
              original_content: doc.content,
            },
          })
          .select()
          .single();

        if (itemError) {
          console.error('Error saving document:', doc.title, itemError);
          continue;
        }

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

  const handleReprocess = async (itemId: string) => {
    try {
      toast.info('Reprocessando...');
      
      const { data, error } = await supabase.functions.invoke('reprocess-knowledge', {
        body: { itemId },
      });

      if (error) throw error;

      if (data.successful > 0) {
        toast.success(`Reprocessado! ${data.totalChunks} chunks criados.`);
        fetchData();
      } else {
        toast.error(data.results?.[0]?.error || 'Erro ao reprocessar');
      }
    } catch (error) {
      console.error('Reprocess error:', error);
      toast.error('Erro ao reprocessar conhecimento');
    }
  };

  const handleReprocessAll = async () => {
    if (!organization?.id) return;
    
    const itemsWithContent = items.filter(
      (item) => item.metadata?.original_content && (item.status === 'processing' || item.status === 'error')
    );

    if (itemsWithContent.length === 0) {
      toast.info('Nenhum item para reprocessar');
      return;
    }

    try {
      toast.info(`Reprocessando ${itemsWithContent.length} itens...`);
      
      const { data, error } = await supabase.functions.invoke('reprocess-knowledge', {
        body: { itemIds: itemsWithContent.map((i) => i.id) },
      });

      if (error) throw error;

      toast.success(`${data.successful} de ${data.processed} reprocessados. ${data.totalChunks} chunks criados.`);
      fetchData();
    } catch (error) {
      console.error('Reprocess all error:', error);
      toast.error('Erro ao reprocessar conhecimentos');
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

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || item.type === filterType;
      const matchesAgent = filterAgent === 'all' || 
        (filterAgent === 'global' ? item.agent_id === null : item.agent_id === filterAgent);
      const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
      
      // Product filter
      let matchesProduct = true;
      if (filterProduct === 'global') {
        matchesProduct = item.scope === 'global' || !item.scope;
      } else if (filterProduct !== 'all') {
        matchesProduct = item.product_id === filterProduct;
      }
      
      // Category filter
      const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
      
      return matchesSearch && matchesType && matchesAgent && matchesStatus && matchesProduct && matchesCategory;
    });
  }, [items, searchTerm, filterType, filterAgent, filterStatus, filterProduct, filterCategory]);

  const getProductName = (productId: string | null) => {
    if (!productId) return null;
    const product = products.find(p => p.id === productId);
    return product?.name || 'Produto';
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
          <TabsTrigger value="wizard_intelligent" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Wizard Inteligente
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
              
              {/* Product Filter */}
              {products.length > 0 && (
                <Select value={filterProduct} onValueChange={setFilterProduct}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Produto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="global">
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        Global
                      </span>
                    </SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <span className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {product.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Category Filter */}
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Categorias</SelectItem>
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
              <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar">
                <RefreshCw className="h-4 w-4" />
              </Button>
              {items.filter((i) => (i.status === 'processing' || i.status === 'error') && i.metadata?.original_content).length > 0 && (
                <Button variant="outline" onClick={handleReprocessAll} title="Reprocessar itens pendentes">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reprocessar ({items.filter((i) => (i.status === 'processing' || i.status === 'error') && i.metadata?.original_content).length})
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <ManualKnowledgeDialog agents={agents} products={products} onSuccess={fetchData} />

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
                const productName = getProductName(item.product_id);

                return (
                  <Card key={item.id} className="group relative">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Scope Badge */}
                          {item.scope === 'product' && productName ? (
                            <Badge variant="outline" className="text-xs bg-secondary/10">
                              <Package className="mr-1 h-3 w-3" />
                              {productName}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              <Globe className="mr-1 h-3 w-3" />
                              Global
                            </Badge>
                          )}
                          <Badge variant="secondary" className={typeConfig.color}>
                            <TypeIcon className="mr-1 h-3 w-3" />
                            {typeConfig.label}
                          </Badge>
                          <Badge variant="outline" className={status.color}>
                            {item.status === 'processing' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {status.label}
                          </Badge>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(item.status === 'error' || item.status === 'processing') && item.metadata?.original_content && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleReprocess(item.id)}
                              title="Reprocessar"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
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
                      </div>
                      <CardTitle className="text-sm font-medium line-clamp-2">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <SourceIcon className="h-3 w-3" />
                        <span>{source.label}</span>
                        {item.category && categoryLabels[item.category] && (
                          <>
                            <span>•</span>
                            <span>{categoryLabels[item.category]}</span>
                          </>
                        )}
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
                        {item.inherits_global && (
                          <>
                            <span>•</span>
                            <span className="text-primary">Herda global</span>
                          </>
                        )}
                        {item.version && item.version > 1 && (
                          <>
                            <span>•</span>
                            <span>v{item.version}</span>
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

        {/* Intelligent Wizard Tab */}
        <TabsContent value="wizard_intelligent" className="mt-4">
          <KnowledgeWizard
            onComplete={() => {
              fetchData();
              setActiveTab('knowledge');
              toast.success('Base de conhecimento configurada!');
            }}
            onCancel={() => setActiveTab('knowledge')}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
