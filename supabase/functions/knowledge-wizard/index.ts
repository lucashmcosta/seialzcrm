import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface WizardRequest {
  recentMessages: ChatMessage[];
  currentSlots: Record<string, string>;
  userMessage: string;
}

interface WizardResponse {
  message: string;
  stage: 'discovery' | 'slots' | 'faq_generation' | 'complete';
  nextQuestion: string | null;
  slotUpdates: Record<string, string>;
  missingSlots: string[];
  suggestedQuestions: string[];
  faqAnswered?: { question: string; answer: string };
}

const WIZARD_SYSTEM_PROMPT = `Você é um Wizard conversacional para coletar informações e gerar uma Base de Conhecimento.

Você NÃO é consultor e NÃO deve afirmar fatos externos sobre mercado, imigração, leis ou regras. Você só coleta e organiza o que o usuário informa.

REGRAS INEGOCIÁVEIS
- Faça APENAS 1 pergunta por vez.
- Seja conversacional e curto (máx 2 linhas).
- Se a resposta for vaga ("depende", "varia"), peça concretização (faixa, exemplo real, regra).
- Se o usuário disser "não sei", registre como lacuna e siga adiante.
- Não invente preço, prazos, documentos, políticas, garantias.
- NUNCA afirme fatos sobre o negócio do usuário. Apenas REPITA ou PARAFRASEIE o que ele disse.
- Seu papel é COLETAR, não INTERPRETAR.

PROCESSO (stages)
1) discovery (1–2 perguntas): entender o que oferece, canal e objetivo.
2) slots (perguntas até preencher os campos mínimos).
3) faq_generation: sugerir 5–10 perguntas que clientes fazem e pedir quais responder.
4) complete: quando slots mínimos + algumas FAQs estiverem respondidas.

FORMATO DE RESPOSTA (SEMPRE JSON VÁLIDO, sem markdown e sem texto fora do JSON)
{
  "message": "mensagem curta",
  "stage": "discovery|slots|faq_generation|complete",
  "nextQuestion": "uma única pergunta ou null",
  "slotUpdates": { "campo": "valor" },
  "missingSlots": ["campo1","campo2"],
  "suggestedQuestions": ["..."],
  "faqAnswered": { "question": "pergunta original", "answer": "resposta do usuário" } ou null
}

CAMPOS MÍNIMOS (slots)
- offer (o que oferece)
- target_customer (pra quem é)
- includes (o que inclui)
- excludes (o que não inclui)
- price (fixo/faixa/ou depende de quê)
- timeline (prazo típico)
- required_inputs (documentos/infos necessárias)
- next_step (como começar: call/whatsapp/pagamento)
- policies (reembolso/cancelamento: sim/não + resumo se existir)

REGRAS DE TRANSIÇÃO:
- Só vá para faq_generation quando TODOS os slots mínimos estiverem preenchidos.
- Em faq_generation, sugira 5-10 perguntas em suggestedQuestions.
- IMPORTANTE: Quando o usuário responde uma pergunta de FAQ (stage faq_generation), você DEVE:
  1. Identificar qual pergunta ele está respondendo (da lista suggestedQuestions ou similar)
  2. Retornar faqAnswered: { "question": "a pergunta", "answer": "a resposta do usuário" }
  3. Remover essa pergunta de suggestedQuestions
- Após o usuário responder 3+ FAQs, mude para complete.
- Em complete, nextQuestion DEVE ser null.`;

function buildContextPrompt(slots: Record<string, string>, messages: ChatMessage[], userMessage: string): string {
  const slotsJson = Object.keys(slots).length > 0 ? JSON.stringify(slots, null, 2) : '{}';
  
  const formattedMessages = messages.map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`).join('\n');
  
  return `Contexto atual:
Slots coletados: ${slotsJson}
Últimas mensagens:
${formattedMessages}

Última mensagem do usuário: ${userMessage}`;
}

async function callLovableAI(messages: Array<{role: string; content: string}>): Promise<string> {
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
      messages,
      temperature: 0.7,
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

function parseWizardResponse(responseText: string): WizardResponse {
  // Try to extract JSON from the response
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
  
  // Validate required fields
  if (!parsed.message || !parsed.stage) {
    throw new Error("Missing required fields in response");
  }
  
  return {
    message: parsed.message,
    stage: parsed.stage,
    nextQuestion: parsed.nextQuestion ?? null,
    slotUpdates: parsed.slotUpdates || {},
    missingSlots: parsed.missingSlots || [],
    suggestedQuestions: parsed.suggestedQuestions || [],
    faqAnswered: parsed.faqAnswered ?? undefined,
  };
}

async function callWithRetry(messages: Array<{role: string; content: string}>): Promise<WizardResponse> {
  const responseText = await callLovableAI(messages);
  
  try {
    return parseWizardResponse(responseText);
  } catch (parseError) {
    console.log("JSON inválido, tentando retry...", parseError);
    
    // Retry with explicit instruction
    const retryMessages = [
      ...messages,
      { role: "assistant", content: responseText },
      { role: "user", content: "Sua resposta anterior não era JSON válido. Retorne APENAS o JSON, sem markdown, sem texto adicional. Comece com { e termine com }." }
    ];
    
    const retryResponseText = await callLovableAI(retryMessages);
    
    try {
      return parseWizardResponse(retryResponseText);
    } catch {
      console.log("Retry também falhou, usando fallback");
      // Fallback: repeat last question
      return {
        message: "Desculpe, tive um problema técnico. Pode repetir sua última resposta?",
        stage: "slots",
        nextQuestion: "Pode repetir sua última resposta?",
        slotUpdates: {},
        missingSlots: [],
        suggestedQuestions: [],
      };
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recentMessages, currentSlots, userMessage } = await req.json() as WizardRequest;
    
    // Build context prompt
    const contextPrompt = buildContextPrompt(currentSlots || {}, recentMessages || [], userMessage || "");
    
    const messages = [
      { role: "system", content: WIZARD_SYSTEM_PROMPT },
      { role: "user", content: contextPrompt }
    ];
    
    const wizardResponse = await callWithRetry(messages);
    
    return new Response(JSON.stringify(wizardResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error("Knowledge wizard error:", error);
    
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
      JSON.stringify({ error: "Erro ao processar wizard. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
