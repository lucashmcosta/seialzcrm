import { useState, useEffect } from 'react';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Loader2, Globe, Package } from 'lucide-react';

interface ManualKnowledgeDialogProps {
  agents: Array<{ id: string; name: string }>;
  products?: Array<{ id: string; name: string; slug: string }>;
  onSuccess: () => void;
}

const CATEGORIES = [
  { value: 'geral', label: 'Geral' },
  { value: 'produto_servico', label: 'Produto/Serviço' },
  { value: 'preco_planos', label: 'Preço/Planos' },
  { value: 'pagamento', label: 'Pagamento' },
  { value: 'processo', label: 'Processo' },
  { value: 'requisitos', label: 'Requisitos' },
  { value: 'politicas', label: 'Políticas' },
  { value: 'faq', label: 'FAQ' },
  { value: 'objecoes', label: 'Objeções' },
  { value: 'qualificacao', label: 'Qualificação' },
  { value: 'horario_contato', label: 'Horário/Contato' },
  { value: 'glossario', label: 'Glossário' },
  { value: 'escopo', label: 'Escopo' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'linguagem', label: 'Linguagem' },
  { value: 'prova_social', label: 'Prova Social' },
];

const knowledgeTypes = [
  { value: 'general', label: 'Geral' },
  { value: 'product', label: 'Produto/Serviço' },
  { value: 'faq', label: 'FAQ' },
  { value: 'policy', label: 'Política' },
  { value: 'process', label: 'Processo' },
  { value: 'objection', label: 'Objeção' },
];

export function ManualKnowledgeDialog({ agents, products = [], onSuccess }: ManualKnowledgeDialogProps) {
  const { organization } = useOrganizationContext();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('general');
  const [content, setContent] = useState('');
  const [agentId, setAgentId] = useState<string>('global');
  
  // New multi-product fields
  const [category, setCategory] = useState('geral');
  const [scope, setScope] = useState<'global' | 'product'>('global');
  const [productId, setProductId] = useState<string>('');
  const [inheritsGlobal, setInheritsGlobal] = useState(false);
  const [localProducts, setLocalProducts] = useState<Array<{ id: string; name: string; slug: string }>>(products);

  // Fetch products when dialog opens
  useEffect(() => {
    const fetchProducts = async () => {
      if (!open || !organization?.id) return;
      if (products.length > 0) {
        setLocalProducts(products);
        return;
      }
      
      const { data, error } = await supabase
        .from('products')
        .select('id, name, slug')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('display_order');
      
      if (!error && data) {
        setLocalProducts(data);
      }
    };
    
    fetchProducts();
  }, [open, organization?.id, products]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !title.trim() || !content.trim()) {
      toast.error('Preencha título e conteúdo');
      return;
    }

    if (scope === 'product' && !productId) {
      toast.error('Selecione um produto');
      return;
    }

    setSaving(true);
    try {
      const trimmedContent = content.trim();
      
      // Create knowledge_item with multi-product fields
      const { data: item, error: itemError } = await supabase
        .from('knowledge_items')
        .insert({
          organization_id: organization.id,
          agent_id: agentId === 'global' ? null : agentId,
          title: title.trim(),
          type,
          category,
          scope,
          product_id: scope === 'product' ? productId : null,
          inherits_global: scope === 'product' ? inheritsGlobal : false,
          status: 'processing',
          source: 'manual',
          metadata: {
            original_content: trimmedContent,
          },
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // Process content to create chunks and embeddings
      const { error: processError } = await supabase.functions.invoke('process-knowledge-item', {
        body: {
          itemId: item.id,
        },
      });

      if (processError) {
        console.error('Process error:', processError);
        // Fallback to old function
        await supabase.functions.invoke('process-knowledge', {
          body: {
            itemId: item.id,
            content: trimmedContent,
          },
        });
      }

      toast.success('Conhecimento adicionado! Processando embeddings...');
      setOpen(false);
      resetForm();
      onSuccess();
    } catch (error) {
      console.error('Error saving knowledge:', error);
      toast.error('Erro ao salvar conhecimento');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setType('general');
    setContent('');
    setAgentId('global');
    setCategory('geral');
    setScope('global');
    setProductId('');
    setInheritsGlobal(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Manual
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {scope === 'global' ? (
                <Globe className="h-5 w-5 text-primary" />
              ) : (
                <Package className="h-5 w-5 text-primary" />
              )}
              Adicionar Conhecimento
            </DialogTitle>
            <DialogDescription>
              Adicione informações que o agente pode usar para responder clientes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                placeholder="Ex: Política de Reembolso"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            {/* Scope Selection */}
            <div className="space-y-2">
              <Label>Escopo</Label>
              <RadioGroup
                value={scope}
                onValueChange={(v) => {
                  setScope(v as 'global' | 'product');
                  if (v === 'global') {
                    setProductId('');
                    setInheritsGlobal(false);
                  }
                }}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="global" id="scope-global" />
                  <Label htmlFor="scope-global" className="font-normal cursor-pointer flex items-center gap-1">
                    <Globe className="h-4 w-4" />
                    Global (todos os produtos)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="product" id="scope-product" />
                  <Label htmlFor="scope-product" className="font-normal cursor-pointer flex items-center gap-1">
                    <Package className="h-4 w-4" />
                    Produto específico
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Product Selection (only if scope = product) */}
            {scope === 'product' && (
              <div className="space-y-4 p-3 rounded-md border border-border bg-muted/30">
                <div className="space-y-2">
                  <Label>Produto</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {localProducts.length === 0 ? (
                        <SelectItem value="none" disabled>
                          Nenhum produto cadastrado
                        </SelectItem>
                      ) : (
                        localProducts.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="inherits-global"
                    checked={inheritsGlobal}
                    onCheckedChange={(checked) => setInheritsGlobal(checked === true)}
                  />
                  <Label htmlFor="inherits-global" className="font-normal cursor-pointer text-sm">
                    Herdar conteúdo global e adicionar específico
                  </Label>
                </div>
                {inheritsGlobal && (
                  <p className="text-xs text-muted-foreground">
                    O conteúdo global será combinado com o conteúdo específico deste produto.
                  </p>
                )}
              </div>
            )}

            {/* Category and Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {knowledgeTypes.map((kt) => (
                      <SelectItem key={kt.value} value={kt.value}>
                        {kt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Agent */}
            <div className="space-y-2">
              <Label>Agente</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">
                    <span className="text-muted-foreground">Global (todos agentes)</span>
                  </SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label htmlFor="content">Conteúdo</Label>
              <Textarea
                id="content"
                rows={6}
                placeholder="Digite o conteúdo que o agente deve conhecer..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                O conteúdo será processado e indexado para busca semântica.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !title.trim() || !content.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
