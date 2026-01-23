import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SynthesizeRequest {
  slots: Record<string, string>;
  faqs: Array<{ question: string; answer: string }>;
}

interface SynthesizeResponse {
  title: string;
  content: string;
}

const SYNTHESIZE_SYSTEM_PROMPT = `Você é um especialista em criar documentos de conhecimento otimizados para busca semântica (RAG).

Você recebe informações coletadas sobre um produto/serviço e deve gerar um documento estruturado.

REGRAS:
1. Use APENAS as informações fornecidas. NÃO invente nada.
2. Se um campo não foi informado ou está como "não informado", NÃO inclua essa seção.
3. Use linguagem clara, direta e profissional.
4. Estruture em seções com headers markdown (##).
5. Cada seção deve ser auto-contida e compreensível isoladamente.

ESTRUTURA DO DOCUMENTO:
- Título: [Nome do produto/serviço] - deve ser claro e descritivo
- ## Visão Geral (1-2 parágrafos resumindo o que é)
- ## Público-Alvo (para quem é indicado)
- ## O que Inclui (lista ou descrição)
- ## O que Não Inclui (se informado)
- ## Investimento (preço/faixa/condições)
- ## Prazo (timeline típico)
- ## Requisitos (documentos/informações necessárias)
- ## Como Começar (próximo passo)
- ## Políticas (reembolso/cancelamento se houver)
- ## Perguntas Frequentes (se houver FAQs)

FORMATO DE RESPOSTA (JSON):
{
  "title": "Título claro e descritivo",
  "content": "Conteúdo em markdown"
}`;

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
  
  // Remove markdown code blocks if present
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

function buildUserPrompt(slots: Record<string, string>, faqs: Array<{ question: string; answer: string }>): string {
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
  
  let prompt = "INFORMAÇÕES COLETADAS:\n\n";
  
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
    const { slots, faqs } = await req.json() as SynthesizeRequest;
    
    if (!slots || Object.keys(slots).length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma informação fornecida para síntese" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const userPrompt = buildUserPrompt(slots, faqs || []);
    const responseText = await callLovableAI(SYNTHESIZE_SYSTEM_PROMPT, userPrompt);
    
    try {
      const result = parseResponse(responseText);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (parseError) {
      console.log("Parse error, trying retry...", parseError);
      
      // Retry with explicit instruction
      const retryPrompt = `${userPrompt}\n\nIMPORTANTE: Retorne APENAS JSON válido, começando com { e terminando com }. Sem markdown code blocks.`;
      const retryText = await callLovableAI(SYNTHESIZE_SYSTEM_PROMPT, retryPrompt);
      
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
