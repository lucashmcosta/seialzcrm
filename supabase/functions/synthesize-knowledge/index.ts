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

interface SynthesizeResponse {
  title: string;
  content: string;
}

const GENERAL_SYNTHESIZE_PROMPT = `Você é um especialista em criar documentos de conhecimento otimizados para busca semântica (RAG).

REGRAS:
1. Use APENAS as informações fornecidas. NÃO invente nada.
2. Se um campo não foi informado ou está como "não informado", NÃO inclua essa seção.
3. Use linguagem clara, direta e profissional.
4. Estruture em seções com headers markdown (##).

ESTRUTURA DO DOCUMENTO:
- Título: [Nome do produto/serviço]
- ## Visão Geral
- ## Público-Alvo
- ## O que Inclui
- ## O que Não Inclui
- ## Investimento
- ## Prazo
- ## Requisitos
- ## Como Começar
- ## Políticas
- ## Perguntas Frequentes

FORMATO DE RESPOSTA (JSON):
{
  "title": "Título claro e descritivo",
  "content": "Conteúdo em markdown"
}`;

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
      return GENERAL_SYNTHESIZE_PROMPT;
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

function parseResponse(responseText: string): SynthesizeResponse {
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
  
  if (!parsed.title || !parsed.content) {
    throw new Error("Missing required fields");
  }
  
  return {
    title: parsed.title,
    content: parsed.content,
  };
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

  // General type
  const slotLabels: Record<string, string> = {
    offer: "O que oferece",
    target_customer: "Público-alvo",
    includes: "O que inclui",
    excludes: "O que não inclui",
    price: "Investimento",
    timeline: "Prazo",
    required_inputs: "Requisitos/documentos",
    next_step: "Próximo passo",
    policies: "Políticas (reembolso/cancelamento)",
  };
  
  prompt = "INFORMAÇÕES COLETADAS:\n\n";
  
  for (const [key, label] of Object.entries(slotLabels)) {
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
  
  prompt += "\n\nGere o documento de conhecimento otimizado para RAG com base nessas informações.";
  
  return prompt;
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
    } else {
      if (!slots || Object.keys(slots).length === 0) {
        return new Response(
          JSON.stringify({ error: "Nenhuma informação fornecida para síntese" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    const systemPrompt = getSynthesizePrompt(knowledgeType);
    const userPrompt = buildUserPrompt(slots || {}, faqs || [], knowledgeType);
    const responseText = await callLovableAI(systemPrompt, userPrompt);
    
    try {
      const result = parseResponse(responseText);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (parseError) {
      console.log("Parse error, trying retry...", parseError);
      
      const retryPrompt = `${userPrompt}\n\nIMPORTANTE: Retorne APENAS JSON válido, começando com { e terminando com }. Sem markdown code blocks.`;
      const retryText = await callLovableAI(systemPrompt, retryPrompt);
      
      const result = parseResponse(retryText);
      return new Response(JSON.stringify(result), {
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
