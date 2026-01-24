import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  category: string;
  scope: 'global' | 'product';
  productName?: string;
  collectedInfo: Record<string, string>;
  conversationExcerpts: string[];
}

interface GenerateResponse {
  title: string;
  content: string;
  keyPoints: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  // Global categories (English keys, Portuguese labels)
  general: "Sobre a Empresa",
  contact_hours: "Horários e Contato",
  payment: "Formas de Pagamento",
  policies: "Políticas",
  scope: "Escopo de Atuação",
  compliance: "Regras de Compliance",
  language_guide: "Guia de Linguagem",
  glossary: "Glossário de Termos",
  
  // Product categories
  product_service: "Descrição do Produto/Serviço",
  pricing_plans: "Preços e Planos",
  process: "Processo e Etapas",
  requirements: "Requisitos",
  objections: "Objeções Comuns",
  qualification: "Critérios de Qualificação",
  faq: "Perguntas Frequentes",
  social_proof: "Casos de Sucesso",
};

const CONTENT_GENERATION_PROMPT = `Você é um especialista em criar conteúdo para bases de conhecimento de agentes de IA.

## TAREFA
Gerar documento estruturado e otimizado para RAG (busca semântica) com base nas informações coletadas durante a conversa.

## REGRAS CRÍTICAS
1. Use APENAS as informações fornecidas - NÃO invente NADA
2. Escreva em primeira pessoa do plural ("Oferecemos", "Aceitamos", "Nossa empresa")
3. Seja direto e completo
4. Organize de forma lógica com headers quando apropriado
5. Se faltar algo crítico, indique com [A DEFINIR]
6. Não use markdown excessivo - prefira texto corrido com headers simples
7. Inclua exemplos concretos quando disponíveis
8. INCLUA uma seção "## Perguntas Frequentes" no FINAL do documento com 3-5 FAQs relevantes baseadas no conteúdo

## FORMATO DE SAÍDA (JSON OBRIGATÓRIO)
{
  "title": "Título descritivo do documento",
  "content": "Conteúdo completo formatado em markdown leve. Use ## para headers. Escreva parágrafos completos. INCLUA uma seção '## Perguntas Frequentes' no final com 3-5 FAQs no formato Q: Pergunta? / R: Resposta.",
  "keyPoints": ["Ponto-chave 1", "Ponto-chave 2", "...até 5 pontos principais"]
}

IMPORTANTE: Responda SEMPRE em JSON válido. Nada antes ou depois do JSON. NÃO inclua campo suggestedFaqs - as FAQs devem estar dentro do content.`;

async function callLovableAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 3000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI gateway error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("RATE_LIMITED");
    }
    if (response.status === 402) {
      throw new Error("PAYMENT_REQUIRED");
    }
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseGenerateResponse(responseText: string): GenerateResponse {
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
    
    return {
      title: parsed.title || "Documento sem título",
      content: parsed.content || "",
      keyPoints: parsed.keyPoints || [],
    };
  } catch (error) {
    console.error("Failed to parse generate response:", error, "Raw:", responseText);
    
    // Return a fallback response with raw content
    return {
      title: "Documento",
      content: responseText,
      keyPoints: [],
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category, scope, productName, collectedInfo, conversationExcerpts }: GenerateRequest = await req.json();

    console.log(`📄 Generating content for category=${category}, scope=${scope}, product=${productName || 'global'}`);

    const categoryLabel = CATEGORY_LABELS[category] || category;
    const scopeDescription = scope === 'product' && productName 
      ? `para o produto/serviço "${productName}"`
      : "da empresa (informações globais)";

    const userPrompt = `## TAREFA
Gere um documento de conhecimento para a categoria "${categoryLabel}" ${scopeDescription}.

## INFORMAÇÕES COLETADAS
${Object.entries(collectedInfo).map(([key, value]) => `### ${key}\n${value}`).join('\n\n')}

## TRECHOS DA CONVERSA (contexto adicional)
${conversationExcerpts.join('\n---\n')}

---

Gere o documento seguindo as regras e formato JSON especificados.`;

    const responseText = await callLovableAI(CONTENT_GENERATION_PROMPT, userPrompt);
    const generateResponse = parseGenerateResponse(responseText);

    // Adjust title based on scope
    if (scope === 'product' && productName) {
      generateResponse.title = `${categoryLabel} - ${productName}`;
    } else {
      generateResponse.title = categoryLabel;
    }

    console.log(`✅ Generated content: title="${generateResponse.title}", keyPoints=${generateResponse.keyPoints.length}`);

    return new Response(JSON.stringify(generateResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Generate content error:", error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message === "RATE_LIMITED") {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Aguarde um momento e tente novamente." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (error.message === "PAYMENT_REQUIRED") {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos para continuar." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
