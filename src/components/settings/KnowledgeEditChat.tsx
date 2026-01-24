import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';
import { 
  MessageSquare, 
  Send, 
  Loader2, 
  Check, 
  X, 
  AlertCircle, 
  Sparkles,
  ArrowRight,
  FileEdit,
  Plus,
  Trash2
} from 'lucide-react';

interface ProposedChange {
  item_id: string | null;
  action: 'update' | 'create' | 'delete';
  category: string;
  scope: 'global' | 'product';
  product_slug: string | null;
  current_title: string | null;
  proposed_title: string | null;
  current_content: string | null;
  proposed_content: string | null;
  change_summary: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposedChanges?: ProposedChange[];
  requestId?: string;
  warnings?: string[];
  timestamp: Date;
}

export function KnowledgeEditChat() {
  const { organization } = useOrganization();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !organization) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('knowledge-edit', {
        body: {
          organizationId: organization.id,
          userRequest: userMessage.content,
        },
      });

      if (error) throw error;

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.understood 
          ? data.explanation || 'Identifiquei as mudanças a serem feitas:'
          : data.needsClarification || 'Não entendi o pedido. Pode reformular?',
        proposedChanges: data.proposedChanges || [],
        requestId: data.requestId,
        warnings: data.warnings || [],
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Error processing edit request:', error);
      
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Desculpe, ocorreu um erro ao processar seu pedido. Tente novamente.',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
      toast.error('Erro ao processar pedido');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (requestId: string) => {
    setApplying(true);

    try {
      const { data, error } = await supabase.functions.invoke('apply-knowledge-edit', {
        body: { requestId },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Aplicadas ${data.appliedChanges?.length || 0} mudanças`);
        
        const confirmMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `✅ Mudanças aplicadas com sucesso! ${data.reindexedItems || 0} item(s) reindexado(s).`,
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, confirmMessage]);
      } else {
        toast.error('Algumas mudanças falharam');
        
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚠️ Algumas mudanças falharam: ${data.errors?.join(', ') || 'Erro desconhecido'}`,
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error applying changes:', error);
      toast.error('Erro ao aplicar mudanças');
    } finally {
      setApplying(false);
    }
  };

  const handleCancel = (requestId: string) => {
    // Just add a message saying cancelled
    const cancelMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '❌ Operação cancelada. Pode fazer outro pedido quando quiser.',
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, cancelMessage]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create': return <Plus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
      case 'update': return <FileEdit className="h-4 w-4 text-primary" />;
      case 'delete': return <Trash2 className="h-4 w-4 text-destructive" />;
      default: return null;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'create': return 'Criar';
      case 'update': return 'Atualizar';
      case 'delete': return 'Excluir';
      default: return action;
    }
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Edição Conversacional
        </CardTitle>
        <CardDescription>
          Descreva as mudanças que deseja fazer na base de conhecimento
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 p-0">
        {/* Messages Area */}
        <ScrollArea ref={scrollRef} className="flex-1 px-4">
          <div className="space-y-4 py-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Comece a conversar</p>
                <p className="text-sm">
                  Exemplos: "Muda o preço do EB2 para $16.000" ou "Adiciona que aceitamos PIX"
                </p>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                  {/* Proposed Changes Preview */}
                  {message.proposedChanges && message.proposedChanges.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <Separator className="my-2" />
                      
                      {message.proposedChanges.map((change, index) => (
                        <div key={index} className="bg-background rounded-md p-3 border">
                          <div className="flex items-center gap-2 mb-2">
                            {getActionIcon(change.action)}
                            <Badge variant="outline" className="text-xs">
                              {getActionLabel(change.action)}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {change.category}
                            </Badge>
                            {change.scope === 'product' && change.product_slug && (
                              <Badge className="text-xs">
                                {change.product_slug}
                              </Badge>
                            )}
                          </div>
                          
                          <p className="text-sm font-medium mb-1">
                            {change.proposed_title || change.current_title || 'Novo item'}
                          </p>
                          
                          <p className="text-xs text-muted-foreground">
                            {change.change_summary}
                          </p>

                          {change.action === 'update' && change.current_content && change.proposed_content && (
                            <div className="mt-2 text-xs space-y-1">
                              <div className="flex items-start gap-2">
                                <span className="text-muted-foreground shrink-0">Antes:</span>
                                <span className="line-through opacity-60 truncate">
                                  {change.current_content.substring(0, 100)}...
                                </span>
                              </div>
                              <div className="flex items-start gap-2">
                                <ArrowRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                                <span className="text-primary truncate">
                                  {change.proposed_content.substring(0, 100)}...
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Warnings */}
                      {message.warnings && message.warnings.length > 0 && (
                        <div className="flex items-start gap-2 p-2 bg-yellow-500/10 rounded-md">
                          <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                          <div className="text-xs text-yellow-600">
                            {message.warnings.map((w, i) => (
                              <p key={i}>{w}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      {message.requestId && (
                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            size="sm"
                            onClick={() => handleApply(message.requestId!)}
                            disabled={applying}
                          >
                            {applying ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4 mr-2" />
                            )}
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancel(message.requestId!)}
                            disabled={applying}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analisando pedido...
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t p-4">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Descreva a mudança que deseja fazer..."
              className="min-h-[60px] resize-none"
              disabled={loading || applying}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || loading || applying}
              className="shrink-0"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
