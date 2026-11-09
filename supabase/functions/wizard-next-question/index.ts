import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { type ChatMessage, openOrgAi, OrgAiError, orgAiErrorResponse, type OrgAiChat } from "../_shared/intelligence/org-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
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
}

interface WizardRequest {
  organization_id?: string;
  wizardState: WizardState;
  userMessage: string;
  conversationHistory: Message[];
}

interface ExtractedInfo {
  category: string;
  product: string | null;
  key: string;
  value: string;
  confidence: number;
}

interface ComparisonInfo {
  comparing: boolean;
  baseProduct: string | null;
  newProduct: string | null;
  sameAs: string[];
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
  comparison: ComparisonInfo;
}

// Valid categories that the database accepts - CRITICAL! (English keys)
const VALID_CATEGORIES = [
  'general', 'contact_hours', 'payment', 'policies', 'scope', 'compliance',
  'language_guide', 'glossary', 'product_service', 'pricing_plans', 'process',
  'requirements', 'objections', 'qualification', 'faq', 'social_proof'
];

const INTELLIGENT_SYSTEM_PROMPT = `Você é um especialista em coletar informações de negócio para bases de conhecimento de agentes de IA.

## SUA MISSÃO
Coletar informações COMPLETAS sobre a empresa e seus produtos/serviços através de perguntas conversacionais inteligentes.

## REGRAS DE COMPORTAMENTO

### 1. PERGUNTAS DINÂMICAS
- NUNCA faça perguntas genéricas. Sempre baseie na resposta anterior.
- Se o usuário mencionar algo novo, EXPLORE antes de mudar de assunto.
- Exemplo: Se disser "aceitamos PIX", pergunte "Tem desconto no PIX?"

### 2. APROFUNDAMENTO
- Se a resposta for vaga ("depende", "varia"), peça exemplos concretos.
- Se mencionar números ("3 planos", "2 serviços"), pergunte sobre cada um.
- Se disser algo importante, confirme: "Então [resumo]. Correto?"

### 3. COMPARAÇÃO ENTRE PRODUTOS
- Ao coletar info do 2º produto, compare com o 1º:
  - "O [Produto2] tem o mesmo preço do [Produto1] ($X)?"
  - "A forma de pagamento é igual?"
  - "O processo é o mesmo?"
- Só pergunte o que DIFERE.

### 4. TRANSIÇÕES NATURAIS
- Quando categoria estiver completa, AVISE: "Ótimo! Já tenho tudo sobre [categoria]. Agora vamos falar de [próxima]."
- Use transições suaves, não robóticas.

### 5. EXPLORAR MENÇÕES
- Se o usuário mencionar um diferencial ("taxa de 95%"), explore: "Como vocês conseguem isso?"
- Se mencionar problema ("clientes reclamam de X"), investigue.

### 6. DETECÇÃO DE PRODUTOS
- Quando o usuário mencionar produtos/serviços específicos, LISTE todos que detectou.
- Use nomes exatos como o usuário disse.
- Exemplo: "EB2-NIW, EB1A, O1" -> detectar 3 produtos.

### 7. QUANDO MARCAR categoryComplete=true (CRÍTICO!)
- MARQUE categoryComplete=true AGRESSIVAMENTE após 2-4 perguntas sobre a mesma categoria
- ESSENCIAL para general: história OU diferenciais OU missão (qualquer um basta!)
- ESSENCIAL para pricing_plans: valores E o que inclui (2 coisas)
- ESSENCIAL para process: etapas OU prazo (qualquer um basta!)
- MESMO SE PARCIAL, marque como complete após 3 perguntas na mesma categoria
- É MELHOR salvar algo incompleto do que PERDER tudo!
- NUNCA espere ter informação perfeita - salve o que tiver

## CATEGORIAS VÁLIDAS (USE APENAS ESTAS - CHAVES EM INGLÊS!)
- general (Sobre a Empresa)
- contact_hours (Horários e Contato)
- payment (Formas de Pagamento)
- policies (Políticas)
- scope (Escopo de Atuação)
- compliance (Regras de Compliance)
- language_guide (Guia de Linguagem)
- glossary (Glossário de Termos)
- product_service (Descrição do Produto)
- pricing_plans (Preços e Planos)
- process (Processo e Etapas)
- requirements (Requisitos)
- objections (Objeções Comuns)
- qualification (Qualificação)
- faq (Perguntas Frequentes)
- social_proof (Casos de Sucesso)

IMPORTANTE: Você só pode usar as categorias listadas acima (em inglês). NUNCA use "review", "geral", "preco_planos" ou qualquer outra categoria não listada.

## CATEGORIAS A COBRIR

### GLOBAIS (valem para todos os produtos):
- general: Sobre a empresa, história, diferenciais, tom de comunicação
- contact_hours: Canais de atendimento, horários, tempo de resposta
- payment: Formas de pagamento (se iguais para todos)
- policies: Reembolso, garantias, cancelamento
- scope: O que a empresa FAZ e NÃO FAZ
- compliance: O que o agente NUNCA deve fazer/prometer
- language_guide: Palavras proibidas/obrigatórias, tom
- glossary: Termos técnicos a explicar para clientes

### POR PRODUTO:
- product_service: O que é, pra quem, benefícios principais
- pricing_plans: Valores, o que inclui/não inclui
- payment: Se diferente do global
- process: Etapas, prazo, o que acontece em cada fase
- requirements: Documentos, pré-requisitos do cliente
- objections: Resistências comuns e como responder
- qualification: Como saber se o lead é bom para este produto
- faq: Perguntas específicas do produto
- social_proof: Casos de sucesso, depoimentos

## FASES DO WIZARD
1. initial: Coleta nome e descrição básica da empresa
2. global: Coleta informações que valem para todos os produtos
3. product: Coleta detalhes específicos de cada produto
4. comparison: Compara produtos para evitar repetição
5. complete: Finalizado (NÃO existe fase "review" - vá direto para complete!)

## FORMATO DE RESPOSTA (JSON OBRIGATÓRIO)
{
  "thinking": "Seu raciocínio interno sobre o que fazer (não será mostrado ao usuário)",
  "action": "ask | clarify | confirm | next_category | next_product | complete",
  "question": "A pergunta a fazer ao usuário (null se action=complete)",
  "extractedInfo": {
    "category": "DEVE SER UMA DAS CATEGORIAS VÁLIDAS LISTADAS ACIMA",
    "product": "nome do produto ou null se global",
    "key": "chave da informação (ex: 'price', 'timeline')",
    "value": "valor extraído da resposta do usuário",
    "confidence": 0.0-1.0
  },
  "productsDetected": ["Lista", "de", "produtos", "mencionados pelo usuário"],
  "categoryComplete": true/false,
  "summaryIfComplete": "Resumo do que foi coletado (apenas se categoryComplete=true)",
  "nextCategory": "próxima categoria a explorar (DEVE SER UMA DAS CATEGORIAS VÁLIDAS)",
  "nextProduct": "próximo produto a configurar (se action=next_product)",
  "comparison": {
    "comparing": true/false,
    "baseProduct": "produto de referência para comparação",
    "newProduct": "produto sendo comparado",
    "sameAs": ["campos", "que", "são", "iguais", "ao", "produto", "base"]
  }
}

IMPORTANTE: 
- Responda SEMPRE em JSON válido. Nada antes ou depois do JSON.
- TODAS as categorias mencionadas DEVEM estar na lista de categorias válidas
- NUNCA use "review" como categoria - use a categoria real da informação`;

function formatCollectedKnowledge(state: WizardState): string {
  const parts: string[] = [];
  
  // Global knowledge
  if (Object.keys(state.globalKnowledge).length > 0) {
    parts.push("### Conhecimento Global:");
    for (const [key, value] of Object.entries(state.globalKnowledge)) {
      parts.push(`- ${key}: ${value}`);
    }
  }
  
  // Product knowledge
  for (const [productSlug, categories] of Object.entries(state.productKnowledge)) {
    if (Object.keys(categories).length > 0) {
      parts.push(`\n### Produto: ${productSlug}`);
      for (const [category, content] of Object.entries(categories)) {
        parts.push(`- ${category}: ${content.slice(0, 200)}...`);
      }
    }
  }
  
  // Products detected
  if (state.products.length > 0) {
    parts.push(`\n### Produtos identificados: ${state.products.map(p => p.name).join(', ')}`);
    for (const product of state.products) {
      if (product.categoriesCompleted.length > 0) {
        parts.push(`  - ${product.name}: categorias completas: ${product.categoriesCompleted.join(', ')}`);
      }
    }
  }
  
  return parts.length > 0 ? parts.join('\n') : 'Nenhuma informação coletada ainda.';
}

function parseWizardResponse(responseText: string): WizardResponse {
  // Clean up the response - remove markdown code blocks if present
  let cleanedText = responseText.trim();
  if (cleanedText.startsWith("```json")) {
    cleanedText = cleanedText.slice(7);
  } else if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.slice(3);
  }
  if (cleanedText.endsWith("```")) {
    cleanedText = cleanedText.slice(0, -3);
  }
  cleanedText = cleanedText.trim();

  try {
    const parsed = JSON.parse(cleanedText);
    
    // Validate and fix category if invalid
    if (parsed.extractedInfo?.category && !VALID_CATEGORIES.includes(parsed.extractedInfo.category)) {
      console.warn(`Invalid category detected: ${parsed.extractedInfo.category}, defaulting to 'geral'`);
      parsed.extractedInfo.category = 'geral';
    }
    
    if (parsed.nextCategory && !VALID_CATEGORIES.includes(parsed.nextCategory)) {
      console.warn(`Invalid nextCategory detected: ${parsed.nextCategory}, defaulting to 'geral'`);
      parsed.nextCategory = 'geral';
    }
    
    // Ensure all required fields exist with defaults
    return {
      thinking: parsed.thinking || "",
      action: parsed.action || "ask",
      question: parsed.question || null,
      extractedInfo: parsed.extractedInfo || null,
      productsDetected: parsed.productsDetected || [],
      categoryComplete: parsed.categoryComplete || false,
      summaryIfComplete: parsed.summaryIfComplete || null,
      nextCategory: parsed.nextCategory || null,
      nextProduct: parsed.nextProduct || null,
      comparison: parsed.comparison || {
        comparing: false,
        baseProduct: null,
        newProduct: null,
        sameAs: [],
      },
    };
  } catch (error) {
    console.error("Failed to parse wizard response:", error, "Raw:", responseText);
    
    // Return a fallback response that asks for clarification
    return {
      thinking: "Failed to parse AI response, asking for clarification",
      action: "clarify",
      question: "Desculpe, não entendi completamente. Pode reformular sua resposta?",
      extractedInfo: null,
      productsDetected: [],
      categoryComplete: false,
      summaryIfComplete: null,
      nextCategory: null,
      nextProduct: null,
      comparison: {
        comparing: false,
        baseProduct: null,
        newProduct: null,
        sameAs: [],
      },
    };
  }
}

async function callWithRetry(ai: OrgAiChat, messages: Array<{ role: string; content: string }>): Promise<WizardResponse> {
  try {
    const responseText = await ai(messages, { maxTokens: 2000 });
    const parsed = parseWizardResponse(responseText);
    
    // If parsing worked but action is invalid, retry once
    if (!['ask', 'clarify', 'confirm', 'next_category', 'next_product', 'complete'].includes(parsed.action)) {
      console.log("Invalid action, retrying...");
      const retryText = await ai(messages, { maxTokens: 2000 });
      return parseWizardResponse(retryText);
    }
    
    return parsed;
  } catch (error) {
    // On first error, retry once
    console.log("First call failed, retrying:", error);
    const retryText = await ai(messages, { maxTokens: 2000 });
    return parseWizardResponse(retryText);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organization_id, wizardState, userMessage, conversationHistory }: WizardRequest = await req.json();
    const gate = await openOrgAi(req, organization_id, "wizard_next_question", corsHeaders);
    if (!gate.ok) return gate.response;

    console.log(`📝 Wizard state: phase=${wizardState.currentPhase}, category=${wizardState.currentCategory}, product=${wizardState.currentProduct}`);
    console.log(`📝 User message: "${userMessage.slice(0, 100)}..."`);

    // Build context for AI
    const recentHistory = conversationHistory.slice(-15);
    const collectedKnowledge = formatCollectedKnowledge(wizardState);

    const userPrompt = `## CONTEXTO ATUAL
Empresa: ${wizardState.companyName || 'Não informado ainda'}
Descrição: ${wizardState.companyDescription || 'Não informado ainda'}
Produtos identificados: ${wizardState.products.length > 0 ? wizardState.products.map(p => p.name).join(', ') : 'Nenhum ainda'}

Fase atual: ${wizardState.currentPhase}
Categoria sendo coletada: ${wizardState.currentCategory || 'Inicial'}
Produto sendo configurado: ${wizardState.currentProduct || 'Global (info geral)'}

### CONHECIMENTO JÁ COLETADO:
${collectedKnowledge}

### HISTÓRICO DA CONVERSA (últimas mensagens):
${recentHistory.map(m => `${m.role === 'user' ? 'USUÁRIO' : 'WIZARD'}: ${m.content}`).join('\n')}

### ÚLTIMA MENSAGEM DO USUÁRIO:
${userMessage}

---

Analise a resposta do usuário e decida:
1. A informação foi suficiente ou precisa aprofundar?
2. Detectou algum produto/serviço novo mencionado?
3. A categoria atual está completa? (LEMBRE: marque complete após 2-4 perguntas!)
4. Qual a próxima pergunta mais relevante?

IMPORTANTE: Use APENAS as categorias válidas listadas no prompt do sistema. NUNCA use "review".

Responda em JSON conforme o formato especificado.`;

    const messages = [
      { role: "system", content: INTELLIGENT_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    const wizardResponse = await callWithRetry(gate.ai, messages);

    console.log(`✅ Wizard response: action=${wizardResponse.action}, categoryComplete=${wizardResponse.categoryComplete}, productsDetected=${wizardResponse.productsDetected.length}`);

    return new Response(JSON.stringify(wizardResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof OrgAiError) return orgAiErrorResponse(error, corsHeaders);
    console.error("Wizard error:", error);

    // Handle specific errors
    if (error instanceof Error) {
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});