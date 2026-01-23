import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type KnowledgeType = 'general' | 'faq_only' | 'policy' | 'product';

interface SynthesizeRequest {
  slots: Record<string, string>;
  faqs: Array<{ question: string; answer: string }>;
  knowledgeType?: KnowledgeType;
}

interface SingleDocument {
  title: string;
  content: string;
  type: string;
}

interface SynthesizeResponse {
  documents: SingleDocument[];
}

// Prompts for individual document types when using 'general' flow
const COMPANY_SYNTHESIZE_PROMPT = `Você é um especialista em criar documentos de conhecimento otimizados para busca semântica (RAG).

TAREFA: Criar documento sobre a EMPRESA (visão geral do negócio).

REGRAS:
1. Use APENAS as informações fornecidas. NÃO invente nada.
2. Se um campo não foi informado, NÃO inclua essa seção.
3. Use linguagem clara, direta e profissional.

ESTRUTURA DO DOCUMENTO:
- Título: Sobre [Nome da Empresa/Negócio]
- ## Visão Geral (o que oferece)
- ## Público-Alvo
- ## Diferenciais (se houver)
- ## Como Funciona / Próximos Passos

FORMATO DE RESPOSTA (JSON):
{
  "title": "Sobre [Nome]",
  "content": "Conteúdo em markdown"
}`;

const PRODUCTS_SYNTHESIZE_PROMPT = `Você é um especialista em criar documentos de conhecimento otimizados para busca semântica (RAG).

TAREFA: Criar documento sobre PRODUTOS/SERVIÇOS.

REGRAS:
1. Use APENAS as informações fornecidas. NÃO invente nada.
2. Se um campo não foi informado, NÃO inclua essa seção.
3. Use linguagem clara, direta e profissional.

ESTRUTURA DO DOCUMENTO:
- Título: Produtos e Serviços
- ## O que Inclui
- ## O que Não Inclui
- ## Investimento / Preços
- ## Prazos
- ## Requisitos

FORMATO DE RESPOSTA (JSON):
{
  "title": "Produtos e Serviços",
  "content": "Conteúdo em markdown"
}`;

const POLICIES_SYNTHESIZE_PROMPT = `Você é um especialista em criar documentos de conhecimento otimizados para busca semântica (RAG).

TAREFA: Criar documento sobre POLÍTICAS da empresa.

REGRAS:
1. Use APENAS as informações fornecidas. NÃO invente nada.
2. Se não houver informação de políticas, retorne content vazio.
3. Use linguagem clara, direta e profissional.

ESTRUTURA DO DOCUMENTO:
- Título: Políticas
- ## Política de Reembolso (se houver)
- ## Política de Cancelamento (se houver)
- ## Garantias (se houver)

FORMATO DE RESPOSTA (JSON):
{
  "title": "Políticas",
  "content": "Conteúdo em markdown ou string vazia se não houver políticas"
}`;

const FAQS_SYNTHESIZE_PROMPT = `Você é um especialista em organizar FAQs para busca semântica.

TAREFA: Formatar as perguntas frequentes coletadas.

REGRAS:
1. Use APENAS as FAQs fornecidas.
2. Organize em formato claro de perguntas e respostas.
3. Use linguagem natural e direta.

ESTRUTURA DO DOCUMENTO:
- Título: Perguntas Frequentes
- ## Perguntas Frequentes
- Cada pergunta em **negrito**, resposta em texto normal

FORMATO DE RESPOSTA (JSON):
{
  "title": "Perguntas Frequentes",
  "content": "## Perguntas Frequentes\\n\\n**P: Pergunta 1?**\\nR: Resposta 1\\n\\n..."
}`;

// Original prompts for individual types
const FAQ_ONLY_SYNTHESIZE_PROMPT = `Você é um especialista em organizar FAQs para busca semântica.

REGRAS:
1. Use APENAS as FAQs fornecidas.
2. Organize em formato claro de perguntas e respostas.
3. Use linguagem natural e direta.

ESTRUTURA DO DOCUMENTO:
- Título: Perguntas Frequentes - [Tema]
- ## Perguntas Frequentes
- Cada pergunta em **negrito**, resposta em texto normal

FORMATO DE RESPOSTA (JSON):
{
  "title": "Perguntas Frequentes - [Tema]",
  "content": "## Perguntas Frequentes\\n\\n**P: Pergunta 1?**\\nR: Resposta 1\\n\\n..."
}`;

const POLICY_SYNTHESIZE_PROMPT = `Você é um especialista em documentar políticas empresariais.

REGRAS:
1. Use APENAS as políticas fornecidas.
2. Seja claro e objetivo sobre termos e condições.
3. Estruture cada política em sua própria seção.

ESTRUTURA DO DOCUMENTO:
- Título: Políticas - [Nome da Empresa/Serviço]
- ## Política de Reembolso (se houver)
- ## Política de Cancelamento (se houver)
- ## Garantia (se houver)
- ## Termos de Uso (se houver)
- ## Privacidade (se houver)

FORMATO DE RESPOSTA (JSON):
{
  "title": "Políticas - [Nome]",
  "content": "Conteúdo em markdown"
}`;

const PRODUCT_SYNTHESIZE_PROMPT = `Você é um especialista em criar fichas técnicas de produtos/serviços.

REGRAS:
1. Use APENAS as informações fornecidas.
2. Seja objetivo e organizado.
3. Inclua FAQs específicas do produto se houver.

ESTRUTURA DO DOCUMENTO:
- Título: [Nome do Produto/Serviço]
- ## Descrição
- ## Características
- ## Preço
- ## Disponibilidade
- ## Público-Alvo
- ## Perguntas Frequentes (se houver)

FORMATO DE RESPOSTA (JSON):
{
  "title": "[Nome do Produto]",
  "content": "Conteúdo em markdown"
}`;

function getSynthesizePrompt(knowledgeType: KnowledgeType): string {
  switch (knowledgeType) {
    case 'faq_only':
      return FAQ_ONLY_SYNTHESIZE_PROMPT;
    case 'policy':
      return POLICY_SYNTHESIZE_PROMPT;
    case 'product':
      return PRODUCT_SYNTHESIZE_PROMPT;
    default:
      return COMPANY_SYNTHESIZE_PROMPT; // Not used for general anymore
  }
}

async function callLovableAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI Gateway error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("RATE_LIMITED");
    }
    if (response.status === 402) {
      throw new Error("PAYMENT_REQUIRED");
    }
    throw new Error(`AI Gateway error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseResponse(responseText: string): { title: string; content: string } {
  let jsonStr = responseText.trim();
  
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();
  
  const parsed = JSON.parse(jsonStr);
  
  if (!parsed.title) {
    throw new Error("Missing title field");
  }
  
  return {
    title: parsed.title,
    content: parsed.content || "",
  };
}

function buildCompanyPrompt(slots: Record<string, string>): string {
  const relevantSlots = ['offer', 'target_customer', 'next_step'];
  let prompt = "INFORMAÇÕES DA EMPRESA:\n\n";
  
  const slotLabels: Record<string, string> = {
    offer: "O que oferece",
    target_customer: "Público-alvo",
    next_step: "Próximo passo / Como começar",
  };
  
  for (const key of relevantSlots) {
    if (slots[key] && slots[key].trim() && slots[key].toLowerCase() !== "não informado") {
      prompt += `${slotLabels[key]}: ${slots[key]}\n`;
    }
  }
  
  prompt += "\nGere o documento sobre a empresa.";
  return prompt;
}

function buildProductsPrompt(slots: Record<string, string>): string {
  const relevantSlots = ['includes', 'excludes', 'price', 'timeline', 'required_inputs'];
  let prompt = "INFORMAÇÕES DE PRODUTOS/SERVIÇOS:\n\n";
  
  const slotLabels: Record<string, string> = {
    includes: "O que inclui",
    excludes: "O que não inclui",
    price: "Investimento/Preço",
    timeline: "Prazo",
    required_inputs: "Requisitos/documentos",
  };
  
  let hasContent = false;
  for (const key of relevantSlots) {
    if (slots[key] && slots[key].trim() && slots[key].toLowerCase() !== "não informado") {
      prompt += `${slotLabels[key]}: ${slots[key]}\n`;
      hasContent = true;
    }
  }
  
  if (!hasContent) {
    return "";
  }
  
  prompt += "\nGere o documento de produtos/serviços.";
  return prompt;
}

function buildPoliciesPrompt(slots: Record<string, string>): string {
  let prompt = "POLÍTICAS:\n\n";
  
  // Check for policies in the general 'policies' slot
  if (slots.policies && slots.policies.trim() && slots.policies.toLowerCase() !== "não informado") {
    prompt += `Políticas: ${slots.policies}\n`;
    prompt += "\nGere o documento de políticas.";
    return prompt;
  }
  
  return "";
}

function buildFaqsPrompt(faqs: Array<{ question: string; answer: string }>): string {
  if (!faqs || faqs.length === 0) {
    return "";
  }
  
  let prompt = "FAQs COLETADAS:\n\n";
  for (const faq of faqs) {
    prompt += `P: ${faq.question}\nR: ${faq.answer}\n\n`;
  }
  prompt += "\nGere o documento de FAQs formatado.";
  return prompt;
}

function buildUserPrompt(slots: Record<string, string>, faqs: Array<{ question: string; answer: string }>, knowledgeType: KnowledgeType): string {
  let prompt = "";

  if (knowledgeType === 'faq_only') {
    prompt = "FAQs COLETADAS:\n\n";
    if (faqs && faqs.length > 0) {
      for (const faq of faqs) {
        prompt += `P: ${faq.question}\nR: ${faq.answer}\n\n`;
      }
    }
    prompt += "\nGere o documento de FAQs formatado.";
    return prompt;
  }

  if (knowledgeType === 'policy') {
    const policyLabels: Record<string, string> = {
      refund_policy: "Política de Reembolso",
      cancellation_policy: "Política de Cancelamento",
      warranty: "Garantia",
      terms: "Termos de Uso",
      privacy: "Privacidade",
    };
    
    prompt = "POLÍTICAS COLETADAS:\n\n";
    for (const [key, label] of Object.entries(policyLabels)) {
      if (slots[key] && slots[key].trim() && slots[key].toLowerCase() !== "não informado") {
        prompt += `${label}: ${slots[key]}\n`;
      }
    }
    prompt += "\nGere o documento de políticas formatado.";
    return prompt;
  }

  if (knowledgeType === 'product') {
    const productLabels: Record<string, string> = {
      product_name: "Nome do Produto",
      description: "Descrição",
      features: "Características",
      price: "Preço",
      availability: "Disponibilidade",
      target_customer: "Público-alvo",
    };
    
    prompt = "INFORMAÇÕES DO PRODUTO:\n\n";
    for (const [key, label] of Object.entries(productLabels)) {
      if (slots[key] && slots[key].trim() && slots[key].toLowerCase() !== "não informado") {
        prompt += `${label}: ${slots[key]}\n`;
      }
    }
    
    if (faqs && faqs.length > 0) {
      prompt += "\nPERGUNTAS FREQUENTES:\n";
      for (const faq of faqs) {
        prompt += `\nP: ${faq.question}\nR: ${faq.answer}\n`;
      }
    }
    
    prompt += "\nGere a ficha do produto formatada.";
    return prompt;
  }

  // General type - not used anymore since we split into multiple docs
  return "";
}

async function synthesizeGeneralType(slots: Record<string, string>, faqs: Array<{ question: string; answer: string }>): Promise<SingleDocument[]> {
  const documents: SingleDocument[] = [];
  
  // 1. Company document (always generate if we have basic info)
  const companyPrompt = buildCompanyPrompt(slots);
  if (companyPrompt) {
    try {
      const response = await callLovableAI(COMPANY_SYNTHESIZE_PROMPT, companyPrompt);
      const doc = parseResponse(response);
      if (doc.content) {
        documents.push({ ...doc, type: 'general' });
      }
    } catch (error) {
      console.error("Error generating company doc:", error);
    }
  }
  
  // 2. Products/Services document
  const productsPrompt = buildProductsPrompt(slots);
  if (productsPrompt) {
    try {
      const response = await callLovableAI(PRODUCTS_SYNTHESIZE_PROMPT, productsPrompt);
      const doc = parseResponse(response);
      if (doc.content) {
        documents.push({ ...doc, type: 'product' });
      }
    } catch (error) {
      console.error("Error generating products doc:", error);
    }
  }
  
  // 3. Policies document
  const policiesPrompt = buildPoliciesPrompt(slots);
  if (policiesPrompt) {
    try {
      const response = await callLovableAI(POLICIES_SYNTHESIZE_PROMPT, policiesPrompt);
      const doc = parseResponse(response);
      if (doc.content) {
        documents.push({ ...doc, type: 'policy' });
      }
    } catch (error) {
      console.error("Error generating policies doc:", error);
    }
  }
  
  // 4. FAQs document
  const faqsPrompt = buildFaqsPrompt(faqs);
  if (faqsPrompt) {
    try {
      const response = await callLovableAI(FAQS_SYNTHESIZE_PROMPT, faqsPrompt);
      const doc = parseResponse(response);
      if (doc.content) {
        documents.push({ ...doc, type: 'faq' });
      }
    } catch (error) {
      console.error("Error generating faqs doc:", error);
    }
  }
  
  return documents;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slots, faqs, knowledgeType = 'general' } = await req.json() as SynthesizeRequest;
    
    // For FAQ only, we just need FAQs
    if (knowledgeType === 'faq_only') {
      if (!faqs || faqs.length === 0) {
        return new Response(
          JSON.stringify({ error: "Nenhuma FAQ fornecida para síntese" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (knowledgeType !== 'general') {
      if (!slots || Object.keys(slots).length === 0) {
        return new Response(
          JSON.stringify({ error: "Nenhuma informação fornecida para síntese" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    // For 'general' type, generate multiple documents
    if (knowledgeType === 'general') {
      const documents = await synthesizeGeneralType(slots || {}, faqs || []);
      
      if (documents.length === 0) {
        return new Response(
          JSON.stringify({ error: "Não foi possível gerar nenhum documento. Verifique as informações fornecidas." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(JSON.stringify({ documents }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // For other types, generate single document (wrapped in documents array for consistency)
    const systemPrompt = getSynthesizePrompt(knowledgeType);
    const userPrompt = buildUserPrompt(slots || {}, faqs || [], knowledgeType);
    const responseText = await callLovableAI(systemPrompt, userPrompt);
    
    try {
      const result = parseResponse(responseText);
      const typeMap: Record<string, string> = {
        faq_only: 'faq',
        policy: 'policy',
        product: 'product',
      };
      return new Response(JSON.stringify({ 
        documents: [{ ...result, type: typeMap[knowledgeType] || 'general' }] 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (parseError) {
      console.log("Parse error, trying retry...", parseError);
      
      const retryPrompt = `${userPrompt}\n\nIMPORTANTE: Retorne APENAS JSON válido, começando com { e terminando com }. Sem markdown code blocks.`;
      const retryText = await callLovableAI(systemPrompt, retryPrompt);
      
      const result = parseResponse(retryText);
      const typeMap: Record<string, string> = {
        faq_only: 'faq',
        policy: 'policy',
        product: 'product',
      };
      return new Response(JSON.stringify({ 
        documents: [{ ...result, type: typeMap[knowledgeType] || 'general' }] 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
  } catch (error) {
    console.error("Synthesize knowledge error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage === "RATE_LIMITED") {
      return new Response(
        JSON.stringify({ error: "Taxa de requisições excedida. Aguarde um momento e tente novamente." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (errorMessage === "PAYMENT_REQUIRED") {
      return new Response(
        JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao seu workspace." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: "Erro ao sintetizar conhecimento. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
