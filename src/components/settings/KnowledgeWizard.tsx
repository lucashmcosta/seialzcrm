import { useState, useRef, useEffect, useCallback } from 'react';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  Send, 
  Loader2, 
  X, 
  BrainCircuit, 
  Package, 
  FileText, 
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
  metadata?: {
    action?: string;
    categoryComplete?: boolean;
    productsDetected?: string[];
    savedItem?: { id: string; title: string };
  };
}

interface ProductInfo {
  name: string;
  slug: string;
  id?: string;
  categoriesCompleted: string[];
}

interface WizardState {
  companyName: string;
  companyDescription: string;
  products: ProductInfo[];
  globalKnowledge: Record<string, string>;
  productKnowledge: Record<string, Record<string, string>>;
  currentPhase: 'initial' | 'global' | 'product' | 'comparison' | 'review' | 'complete';
  currentCategory: string | null;
  currentProduct: string | null;
  savedItems: Array<{ id: string; title: string; category: string; productId?: string }>;
}

interface ExtractedInfo {
  category: string;
  product: string | null;
  key: string;
  value: string;
  confidence: number;
}

interface WizardResponse {
  thinking: string;
  action: 'ask' | 'clarify' | 'confirm' | 'next_category' | 'next_product' | 'complete';
  question: string | null;
  extractedInfo: ExtractedInfo | null;
  productsDetected: string[];
  categoryComplete: boolean;
  summaryIfComplete: string | null;
  nextCategory: string | null;
  nextProduct: string | null;
  comparison: {
    comparing: boolean;
    baseProduct: string | null;
    newProduct: string | null;
    sameAs: string[];
  };
}

interface GenerateResponse {
  title: string;
  content: string;
  keyPoints: string[];
  suggestedFaqs: Array<{ question: string; answer: string }>;
}

interface KnowledgeWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  geral: "Sobre a Empresa",
  horario_contato: "Horários e Contato",
  pagamento: "Formas de Pagamento",
  politicas: "Políticas",
  escopo: "Escopo de Atuação",
  compliance: "Regras de Compliance",
  linguagem: "Guia de Linguagem",
  glossario: "Glossário de Termos",
  produto_servico: "Descrição do Produto",
  preco_planos: "Preços e Planos",
  processo: "Processo e Etapas",
  requisitos: "Requisitos",
  objecoes: "Objeções Comuns",
  qualificacao: "Qualificação",
  faq: "Perguntas Frequentes",
  prova_social: "Casos de Sucesso",
};

const GLOBAL_CATEGORIES = ['geral', 'horario_contato', 'pagamento', 'politicas', 'escopo', 'compliance'];
const PRODUCT_CATEGORIES = ['produto_servico', 'preco_planos', 'processo', 'requisitos', 'objecoes', 'faq'];

const initialState: WizardState = {
  companyName: '',
  companyDescription: '',
  products: [],
  globalKnowledge: {},
  productKnowledge: {},
  currentPhase: 'initial',
  currentCategory: null,
  currentProduct: null,
  savedItems: [],
};

export function KnowledgeWizard({ onComplete, onCancel }: KnowledgeWizardProps) {
  const { organization } = useOrganizationContext();
  const [state, setState] = useState<WizardState>(initialState);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input after loading
  useEffect(() => {
    if (!loading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading]);

  // Initialize wizard
  useEffect(() => {
    const initialMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Olá! 👋 Vou te ajudar a configurar a base de conhecimento do seu agente de IA de forma inteligente.\n\nPara começar, **qual o nome da sua empresa?**',
      timestamp: new Date(),
    };
    setMessages([initialMessage]);
  }, []);

  // Create product in database
  const createProductIfNeeded = useCallback(async (productName: string): Promise<string | null> => {
    if (!organization?.id) return null;

    const slug = productName.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    try {
      // Check if exists
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('slug', slug)
        .maybeSingle();

      if (existing) {
        return existing.id;
      }

      // Create new product
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert({
          organization_id: organization.id,
          name: productName,
          slug,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`Produto "${productName}" criado automaticamente!`);
      return newProduct?.id || null;
    } catch (err) {
      console.error('Failed to create product:', err);
      return null;
    }
  }, [organization?.id]);

  // Save knowledge item to database
  const saveKnowledgeItem = useCallback(async (
    title: string,
    content: string,
    category: string,
    scope: 'global' | 'product',
    productId?: string
  ): Promise<{ id: string; title: string } | null> => {
    if (!organization?.id) return null;

    try {
      const { data: item, error } = await supabase
        .from('knowledge_items')
        .insert({
          organization_id: organization.id,
          title,
          content,
          category,
          scope,
          product_id: productId || null,
          type: 'manual',
          source: 'wizard_intelligent',
          status: 'processing',
          metadata: { original_content: content },
        })
        .select()
        .single();

      if (error) throw error;

      // Trigger processing for embeddings
      await supabase.functions.invoke('process-knowledge-item', {
        body: { itemId: item.id },
      });

      return { id: item.id, title };
    } catch (err) {
      console.error('Failed to save knowledge item:', err);
      toast.error('Erro ao salvar item de conhecimento');
      return null;
    }
  }, [organization?.id]);

  // Generate content for a completed category
  const generateCategoryContent = useCallback(async (
    category: string,
    scope: 'global' | 'product',
    productName?: string,
    collectedInfo: Record<string, string> = {},
    conversationExcerpts: string[] = []
  ): Promise<GenerateResponse | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('wizard-generate-content', {
        body: {
          category,
          scope,
          productName,
          collectedInfo,
          conversationExcerpts,
        },
      });

      if (error) throw error;
      return data as GenerateResponse;
    } catch (err) {
      console.error('Failed to generate content:', err);
      return null;
    }
  }, []);

  // Handle sending a message
  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Call wizard-next-question edge function
      const { data, error: fnError } = await supabase.functions.invoke('wizard-next-question', {
        body: {
          wizardState: state,
          userMessage,
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
        },
      });

      if (fnError) {
        if (fnError.message?.includes('429')) {
          throw new Error('Limite de requisições excedido. Aguarde um momento.');
        }
        if (fnError.message?.includes('402')) {
          throw new Error('Créditos de IA esgotados.');
        }
        throw fnError;
      }

      const response = data as WizardResponse;
      console.log('Wizard response:', response);

      // Update state based on response
      let newState = { ...state };
      const messageMetadata: Message['metadata'] = {
        action: response.action,
        categoryComplete: response.categoryComplete,
        productsDetected: response.productsDetected,
      };

      // Extract company info in initial phase
      if (state.currentPhase === 'initial') {
        if (!state.companyName && userMessage.length > 1) {
          newState.companyName = userMessage;
        } else if (state.companyName && !state.companyDescription) {
          newState.companyDescription = userMessage;
          newState.currentPhase = 'global';
          newState.currentCategory = 'geral';
        }
      }

      // Handle extracted info
      if (response.extractedInfo && response.extractedInfo.confidence > 0.5) {
        const { category, product, key, value } = response.extractedInfo;
        
        if (product) {
          // Product-specific knowledge
          if (!newState.productKnowledge[product]) {
            newState.productKnowledge[product] = {};
          }
          const existingContent = newState.productKnowledge[product][category] || '';
          newState.productKnowledge[product][category] = existingContent 
            ? `${existingContent}\n\n**${key}**: ${value}`
            : `**${key}**: ${value}`;
        } else {
          // Global knowledge
          const existingContent = newState.globalKnowledge[category] || '';
          newState.globalKnowledge[category] = existingContent
            ? `${existingContent}\n\n**${key}**: ${value}`
            : `**${key}**: ${value}`;
        }
      }

      // Handle detected products
      if (response.productsDetected && response.productsDetected.length > 0) {
        for (const productName of response.productsDetected) {
          const exists = newState.products.some(
            p => p.name.toLowerCase() === productName.toLowerCase()
          );
          
          if (!exists) {
            const productId = await createProductIfNeeded(productName);
            newState.products.push({
              name: productName,
              slug: productName.toLowerCase().replace(/\s+/g, '-'),
              id: productId || undefined,
              categoriesCompleted: [],
            });
          }
        }
      }

      // Handle category completion - generate and save content
      if (response.categoryComplete && state.currentCategory) {
        const isProductCategory = PRODUCT_CATEGORIES.includes(state.currentCategory);
        const scope = isProductCategory && state.currentProduct ? 'product' : 'global';
        
        // Get relevant conversation excerpts (last 10 messages)
        const recentConvo = messages.slice(-10).map(m => `${m.role}: ${m.content}`);
        
        // Get collected info for this category
        const collectedInfo = scope === 'product' && state.currentProduct
          ? newState.productKnowledge[state.currentProduct] || {}
          : { [state.currentCategory]: newState.globalKnowledge[state.currentCategory] || '' };

        // Generate content
        const generated = await generateCategoryContent(
          state.currentCategory,
          scope,
          scope === 'product' ? state.currentProduct || undefined : undefined,
          collectedInfo,
          recentConvo
        );

        if (generated && generated.content) {
          // Find product ID if product-specific
          let productId: string | undefined;
          if (scope === 'product' && state.currentProduct) {
            const product = newState.products.find(p => p.name === state.currentProduct);
            productId = product?.id;
          }

          // Save to database
          const savedItem = await saveKnowledgeItem(
            generated.title,
            generated.content,
            state.currentCategory,
            scope,
            productId
          );

          if (savedItem) {
            newState.savedItems.push({
              ...savedItem,
              category: state.currentCategory,
              productId,
            });
            messageMetadata.savedItem = savedItem;

            // Mark category as complete for product
            if (scope === 'product' && state.currentProduct) {
              const productIdx = newState.products.findIndex(p => p.name === state.currentProduct);
              if (productIdx >= 0) {
                newState.products[productIdx].categoriesCompleted.push(state.currentCategory);
              }
            }

            // Save suggested FAQs as separate items
            if (generated.suggestedFaqs && generated.suggestedFaqs.length > 0) {
              const faqContent = generated.suggestedFaqs
                .map(faq => `**${faq.question}**\n${faq.answer}`)
                .join('\n\n---\n\n');
              
              await saveKnowledgeItem(
                `FAQ - ${generated.title}`,
                faqContent,
                'faq',
                scope,
                productId
              );
            }
          }
        }
      }

      // Handle phase transitions
      if (response.action === 'next_category' && response.nextCategory) {
        newState.currentCategory = response.nextCategory;
        
        // Check if moving to product phase
        if (PRODUCT_CATEGORIES.includes(response.nextCategory) && newState.currentPhase === 'global') {
          newState.currentPhase = 'product';
          if (newState.products.length > 0 && !newState.currentProduct) {
            newState.currentProduct = newState.products[0].name;
          }
        }
      }

      if (response.action === 'next_product' && response.nextProduct) {
        newState.currentProduct = response.nextProduct;
        newState.currentCategory = 'produto_servico';
      }

      if (response.action === 'complete') {
        newState.currentPhase = 'complete';
      }

      setState(newState);

      // Add assistant message
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.question || 'Configuração concluída! 🎉',
        timestamp: new Date(),
        metadata: messageMetadata,
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Handle completion
      if (response.action === 'complete') {
        toast.success(`Base de conhecimento configurada com ${newState.savedItems.length} itens!`);
        setTimeout(() => onComplete(), 2000);
      }

    } catch (err) {
      console.error('Wizard error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      
      // Add error message
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `⚠️ ${errorMessage}\n\nPor favor, tente novamente.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, state, messages, createProductIfNeeded, saveKnowledgeItem, generateCategoryContent, onComplete]);

  // Calculate progress
  const calculateProgress = useCallback(() => {
    const totalGlobalCategories = GLOBAL_CATEGORIES.length;
    const totalProductCategories = state.products.length * PRODUCT_CATEGORIES.length;
    const total = totalGlobalCategories + totalProductCategories;

    if (total === 0) return 0;

    const completedGlobal = Object.keys(state.globalKnowledge).length;
    const completedProduct = state.products.reduce(
      (acc, p) => acc + p.categoriesCompleted.length, 
      0
    );

    return Math.round(((completedGlobal + completedProduct) / total) * 100);
  }, [state]);

  return (
    <Card className="flex flex-col h-[600px] max-h-[80vh]">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BrainCircuit className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Wizard Inteligente</h3>
              <p className="text-sm text-muted-foreground">
                {state.currentPhase === 'initial' && 'Configuração inicial'}
                {state.currentPhase === 'global' && `Configurando: ${CATEGORY_LABELS[state.currentCategory!] || 'Globais'}`}
                {state.currentPhase === 'product' && `Produto: ${state.currentProduct}`}
                {state.currentPhase === 'complete' && 'Configuração concluída'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {state.products.length > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Package className="h-3 w-3" />
                {state.products.length} produto(s)
              </Badge>
            )}
            <Badge variant="outline" className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {state.savedItems.length} itens salvos
            </Badge>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Progresso</span>
            <span>{calculateProgress()}%</span>
          </div>
          <Progress value={calculateProgress()} className="h-2" />
        </div>

        {/* Category pills */}
        {state.currentPhase !== 'initial' && (
          <div className="flex flex-wrap gap-1 mt-3">
            {GLOBAL_CATEGORIES.slice(0, 4).map(cat => {
              const isComplete = state.globalKnowledge[cat];
              const isCurrent = state.currentCategory === cat && state.currentPhase === 'global';
              return (
                <Badge 
                  key={cat}
                  variant={isComplete ? "default" : isCurrent ? "secondary" : "outline"}
                  className={cn(
                    "text-xs",
                    isComplete && "bg-green-500/20 text-green-700 border-green-500/30",
                    isCurrent && "ring-2 ring-primary/50"
                  )}
                >
                  {isComplete && <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {CATEGORY_LABELS[cat]}
                </Badge>
              );
            })}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-4 py-2",
                    msg.role === 'user'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  
                  {/* Show saved item indicator */}
                  {msg.metadata?.savedItem && (
                    <div className="flex items-center gap-1 mt-2 text-xs opacity-70">
                      <CheckCircle2 className="h-3 w-3" />
                      Item salvo: {msg.metadata.savedItem.title}
                    </div>
                  )}
                  
                  {/* Show detected products */}
                  {msg.metadata?.productsDetected && msg.metadata.productsDetected.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {msg.metadata.productsDetected.map(product => (
                        <Badge key={product} variant="secondary" className="text-xs">
                          <Package className="h-3 w-3 mr-1" />
                          {product}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Pensando...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <CardFooter className="border-t p-3">
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm mb-2 w-full">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        
        <div className="flex gap-2 w-full">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={state.currentPhase === 'complete' ? 'Configuração concluída!' : 'Digite sua resposta...'}
            className="min-h-[60px] resize-none"
            disabled={loading || state.currentPhase === 'complete'}
          />
          <Button
            onClick={handleSend}
            disabled={loading || !input.trim() || state.currentPhase === 'complete'}
            size="icon"
            className="h-[60px] w-[60px]"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
