import { useState } from 'react';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2, CreditCard, HelpCircle, Package, FileText, Settings2, Book } from 'lucide-react';

interface ManualKnowledgeDialogProps {
  agents: Array<{ id: string; name: string }>;
  onSuccess: () => void;
}

const knowledgeTypes = [
  { value: 'payment', label: 'Link de Pagamento', icon: CreditCard, description: 'URLs de checkout ou pagamento' },
  { value: 'product', label: 'Produto/Serviço', icon: Package, description: 'Informações sobre produtos' },
  { value: 'faq', label: 'FAQ', icon: HelpCircle, description: 'Perguntas frequentes' },
  { value: 'policy', label: 'Política', icon: FileText, description: 'Regras e políticas' },
  { value: 'process', label: 'Processo', icon: Settings2, description: 'Fluxos de trabalho' },
  { value: 'general', label: 'Geral', icon: Book, description: 'Outros conhecimentos' },
];

export function ManualKnowledgeDialog({ agents, onSuccess }: ManualKnowledgeDialogProps) {
  const { organization } = useOrganizationContext();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('payment');
  const [content, setContent] = useState('');
  const [agentId, setAgentId] = useState<string>('global');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !title.trim() || !content.trim()) {
      toast.error('Preencha título e conteúdo');
      return;
    }

    setSaving(true);
    try {
      // 1. Create knowledge_item
      const { data: item, error: itemError } = await supabase
        .from('knowledge_items')
        .insert({
          organization_id: organization.id,
          agent_id: agentId === 'global' ? null : agentId,
          title: title.trim(),
          type: type === 'payment' ? 'policy' : type, // payment maps to policy type
          status: 'processing',
          source: 'manual',
          metadata: type === 'payment' ? { is_payment_link: true } : {},
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // 2. Process content to create chunks and embeddings
      const { error: processError } = await supabase.functions.invoke('process-knowledge', {
        body: {
          itemId: item.id,
          content: content.trim(),
        },
      });

      if (processError) {
        console.error('Process error:', processError);
        // Still show success, processing happens async
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
    setType('payment');
    setContent('');
    setAgentId('global');
  };

  const selectedType = knowledgeTypes.find(t => t.value === type);
  const TypeIcon = selectedType?.icon || Book;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Manual
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TypeIcon className="h-5 w-5 text-primary" />
              Adicionar Conhecimento
            </DialogTitle>
            <DialogDescription>
              Adicione informações que o agente pode usar para responder clientes.
              {type === 'payment' && (
                <span className="block mt-1 text-primary">
                  💡 Inclua a URL completa (https://...) no conteúdo
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                placeholder="Ex: Link de Pagamento - Visto B1/B2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {knowledgeTypes.map((kt) => (
                      <SelectItem key={kt.value} value={kt.value}>
                        <div className="flex items-center gap-2">
                          <kt.icon className="h-4 w-4" />
                          {kt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Agente</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">
                      <span className="text-muted-foreground">Global (todos)</span>
                    </SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Conteúdo</Label>
              <Textarea
                id="content"
                rows={6}
                placeholder={
                  type === 'payment'
                    ? "Ex:\nPara pagamento da Assessoria Visto B1/B2, use:\nhttps://mpago.la/seu-link-aqui\n\nValor: R$ 1.500,00\nParcelamento: até 12x sem juros"
                    : "Digite o conteúdo que o agente deve conhecer..."
                }
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
